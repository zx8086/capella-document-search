/* src/lib/config/authConfig.ts */

import { LogLevel, PublicClientApplication } from "@azure/msal-browser";
import { browser } from "$app/environment";
import { frontendConfig } from "$frontendConfig";

let msalInstance: PublicClientApplication | null = null;

// Helper to detect Safari
export const isSafari = () => {
  if (!browser) return false;
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
};

// Get the base URL safely
const _getBaseUrl = () => {
  if (!browser) return "";
  return window.location.origin;
};

export const msalConfig = {
  auth: {
    clientId: frontendConfig.azure.CLIENT_ID,
    authority: `https://login.microsoftonline.com/${frontendConfig.azure.TENANT_ID}`,
    redirectUri: frontendConfig.azure.REDIRECT_URI,
    postLogoutRedirectUri: frontendConfig.azure.REDIRECT_URI,
    navigateToLoginRequestUrl: true,
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: true,
    secureCookies: false,
  },
  system: {
    allowRedirectInIframe: true,
    tokenRenewalOffsetSeconds: 300,
    redirectNavigationTimeout: 30000,
    windowHashTimeout: 60000,
    iframeHashTimeout: 60000,
    loggerOptions: {
      loggerCallback: (_level, _message, containsPii) => {
        if (!containsPii && browser) {
          // console.debug(`MSAL - ${level}: ${message}`);
        }
      },
      piiLoggingEnabled: false,
      logLevel: LogLevel.Verbose,
    },
  },
};

export const loginRequest = {
  scopes: ["User.Read", "User.ReadBasic.All", "profile", "openid", "email"],
  prompt: "select_account",
  redirectStartPage: browser ? window.location.href : "",
  // Add Safari-specific parameters
  extraQueryParameters: isSafari()
    ? {
        response_mode: "query",
      }
    : {},
};

export const photoRequest = {
  scopes: ["User.Read"],
};

export const getMsalInstance = async () => {
  if (!msalInstance && browser) {
    try {
      msalInstance = new PublicClientApplication(msalConfig);
      await msalInstance.initialize();
    } catch (error) {
      console.error("MSAL initialization failed:", error);
      msalInstance = null;
    }
  }
  return msalInstance;
};

export const graphConfig = {
  graphMeEndpoint: "https://graph.microsoft.com/v1.0/me",
};

export const clearMsalCache = () => {
  if (browser) {
    sessionStorage.clear();
    localStorage.clear();
    document.cookie.split(";").forEach((cookie) => {
      document.cookie = cookie
        .replace(/^ +/, "")
        .replace(/=.*/, `=;expires=${new Date().toUTCString()};path=/`);
    });
  }
};

export const getRedirectUri = () => {
  if (!browser) return frontendConfig.azure.REDIRECT_URI;
  return `${window.location.origin}/`;
};
