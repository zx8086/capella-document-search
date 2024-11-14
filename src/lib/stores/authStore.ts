import { writable } from 'svelte/store';
import { msalInstance, loginRequest } from '../config/authConfig';
import type { AccountInfo } from '@azure/msal-browser';
import { goto } from '$app/navigation';

export const isAuthenticated = writable(false);
export const userAccount = writable<AccountInfo | null>(null);
export const isLoading = writable(false);

export const auth = {
    async initialize() {
        try {
            if (!msalInstance.getActiveAccount()) {
                await msalInstance.initialize();
            }
            const accounts = msalInstance.getAllAccounts();
            if (accounts.length > 0) {
                isAuthenticated.set(true);
                userAccount.set(accounts[0]);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to initialize MSAL:', error);
            return false;
        }
    },

    async loginPopup() {
        isLoading.set(true);
        try {
            if (msalInstance.getActiveAccount()) {
                await msalInstance.handleRedirectPromise();
                return;
            }

            const response = await msalInstance.loginPopup(loginRequest);
            if (response) {
                isAuthenticated.set(true);
                userAccount.set(response.account);
                msalInstance.setActiveAccount(response.account);
                await goto('/', { replaceState: true });
            }
        } catch (error) {
            console.error('Login failed:', error);
            msalInstance.clearCache();
            throw error;
        } finally {
            isLoading.set(false);
        }
    },

    async logout() {
        try {
            await msalInstance.logoutPopup({
                postLogoutRedirectUri: "/login",
            });
            isAuthenticated.set(false);
            userAccount.set(null);
            msalInstance.clearCache();
            await goto('/login', { replaceState: true });
        } catch (error) {
            console.error('Logout failed:', error);
            throw error;
        }
    }
}; 