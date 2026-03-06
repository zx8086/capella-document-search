// src/lib/stores/auth.svelte.ts

import type { AccountInfo } from "@azure/msal-browser";
import { browser } from "$app/environment";
import { clearMsalCache, getMsalInstance, isSafari, loginRequest } from "$lib/config/authConfig";
import {
  cleanupTracker,
  ensureTrackerActive,
  setTrackerUser,
  trackEvent,
} from "$lib/context/tracker";
import { cleanupPhotoCache } from "$lib/stores/photo.svelte";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  userAccount: AccountInfo | null;
  trackerLoading: boolean;
}

function createAuthStore() {
  const state = $state<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    userAccount: null,
    trackerLoading: false,
  });

  async function initialize(): Promise<boolean> {
    if (!browser) return false;

    try {
      state.isLoading = true;
      state.trackerLoading = true;

      const instance = await getMsalInstance();
      if (!instance) return false;

      const response = await instance.handleRedirectPromise().catch((error) => {
        console.warn("Redirect promise error:", error);
        return null;
      });

      if (response) {
        const account = response.account;
        if (account) {
          instance.setActiveAccount(account);
          state.isAuthenticated = true;
          state.userAccount = account;

          if (account?.username) {
            await ensureTrackerActive();
            setTrackerUser(account.username, {
              name: account.name,
              email: account.username,
              accountId: account.localAccountId || account.homeAccountId,
              tenantId: account.tenantId,
              environment: import.meta.env.DEV ? "development" : "production",
            });
          }

          return true;
        }
      }

      const accounts = instance.getAllAccounts();
      if (accounts.length > 0) {
        instance.setActiveAccount(accounts[0]);
        state.isAuthenticated = true;
        state.userAccount = accounts[0];

        if (accounts[0]?.username) {
          await ensureTrackerActive();
          setTrackerUser(accounts[0].username, {
            name: accounts[0].name,
            email: accounts[0].username,
            accountId: accounts[0].localAccountId || accounts[0].homeAccountId,
            tenantId: accounts[0].tenantId,
            environment: import.meta.env.DEV ? "development" : "production",
          });
        }

        return true;
      }

      return false;
    } catch (error) {
      console.error("Auth initialization failed:", error);
      state.isAuthenticated = false;
      state.userAccount = null;
      return false;
    } finally {
      state.isLoading = false;
      state.trackerLoading = false;
    }
  }

  function checkAuth(): boolean {
    return state.isAuthenticated;
  }

  async function login(_testMode = false): Promise<void> {
    console.log("Auth store: Starting login process...");
    try {
      state.isLoading = true;

      const instance = await getMsalInstance();
      if (!instance) {
        throw new Error("MSAL instance not initialized");
      }

      clearMsalCache();

      if (isSafari()) {
        console.log("Safari detected, using standard redirect flow...");
        trackEvent("Auth_Flow", {
          step: "redirect_start",
          method: "standard",
        });

        const loginRequestWithState = {
          ...loginRequest,
          state: Date.now().toString(),
          prompt: "select_account",
        };

        await instance.loginRedirect(loginRequestWithState);
        return;
      }

      trackEvent("Auth_Flow", {
        step: "redirect_start",
        method: "standard",
      });

      const loginRequestWithState = {
        ...loginRequest,
        state: Date.now().toString(),
        prompt: "select_account",
      };

      await instance.loginRedirect(loginRequestWithState);
    } catch (error) {
      console.error("Login failed:", error);
      trackEvent("Auth_Flow", {
        step: "error",
        error: (error as Error)?.message || "unknown_error",
        browser: isSafari() ? "safari" : "other",
      });
      state.isAuthenticated = false;
      state.userAccount = null;
      throw error;
    } finally {
      state.isLoading = false;
    }
  }

  async function logout(): Promise<void> {
    if (!browser) return;

    try {
      state.isLoading = true;
      const instance = await getMsalInstance();

      if (instance) {
        cleanupTracker();
        cleanupPhotoCache();
        state.isAuthenticated = false;
        state.userAccount = null;

        const activeAccount = instance.getActiveAccount();
        instance.setActiveAccount(null);

        if (navigator.userAgent.includes("Chrome")) {
          localStorage.clear();
          sessionStorage.clear();
          document.cookie.split(";").forEach((cookie) => {
            document.cookie = cookie
              .replace(/^ +/, "")
              .replace(/=.*/, `=;expires=${new Date().toUTCString()};path=/`);
          });
        }

        await instance.logoutRedirect({
          account: activeAccount,
          postLogoutRedirectUri: `${window.location.origin}/login`,
        });
      } else {
        window.location.href = "/login";
      }
    } catch (error) {
      console.error("Logout error:", error);
      if (navigator.userAgent.includes("Chrome")) {
        window.location.replace("/login");
      } else {
        window.location.href = "/login";
      }
    } finally {
      state.isLoading = false;
    }
  }

  function setLoading(loading: boolean) {
    state.isLoading = loading;
  }

  function setAuthenticated(authenticated: boolean) {
    state.isAuthenticated = authenticated;
  }

  function setUserAccount(account: AccountInfo | null) {
    state.userAccount = account;
  }

  function setTrackerLoading(loading: boolean) {
    state.trackerLoading = loading;
  }

  return {
    get isAuthenticated() {
      return state.isAuthenticated;
    },
    get isLoading() {
      return state.isLoading;
    },
    get userAccount() {
      return state.userAccount;
    },
    get trackerLoading() {
      return state.trackerLoading;
    },
    initialize,
    checkAuth,
    login,
    logout,
    setLoading,
    setAuthenticated,
    setUserAccount,
    setTrackerLoading,
  };
}

export const authStore = createAuthStore();

// Convenience aliases for backward compatibility during migration
export const auth = {
  initialize: () => authStore.initialize(),
  checkAuth: () => authStore.checkAuth(),
  login: (testMode?: boolean) => authStore.login(testMode),
  logout: () => authStore.logout(),
};
