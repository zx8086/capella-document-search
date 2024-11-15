import { writable } from 'svelte/store';
import { getMsalInstance, loginRequest } from '../config/authConfig';
import type { AccountInfo } from '@azure/msal-browser';
import { browser } from '$app/environment';

export const isAuthenticated = writable(false);
export const userAccount = writable<AccountInfo | null>(null);
export const isLoading = writable(false);

export const auth = {
    async initialize() {
        console.log('Initializing auth...');
        try {
            const instance = await getMsalInstance();
            if (!instance) {
                console.log('MSAL instance not available');
                return false;
            }

            const accounts = instance.getAllAccounts();
            if (accounts.length > 0) {
                instance.setActiveAccount(accounts[0]);
                isAuthenticated.set(true);
                userAccount.set(accounts[0]);
                console.log('User authenticated from existing account');
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to initialize auth:', error);
            return false;
        }
    },

    async login() {
        console.log('Attempting login...');
        isLoading.set(true);
        try {
            const instance = await getMsalInstance();
            if (!instance) throw new Error('MSAL not initialized');
            await instance.loginRedirect(loginRequest);
        } catch (error) {
            console.error('Login failed:', error);
            isLoading.set(false);
            throw error;
        }
    },

    async handleRedirectPromise() {
        console.log('Handling redirect promise...');
        try {
            const instance = await getMsalInstance();
            if (!instance) return false;

            const response = await instance.handleRedirectPromise();
            if (response) {
                instance.setActiveAccount(response.account);
                isAuthenticated.set(true);
                userAccount.set(response.account);
                console.log('Successfully handled redirect');
                return true;
            }
            return false;
        } catch (error) {
            console.error('Handle redirect failed:', error);
            return false;
        }
    },

    async logout() {
        console.log('Logging out...');
        try {
            const instance = await getMsalInstance();
            if (!instance) return;

            // Check if there's an interaction in progress
            if (instance.getActiveAccount()) {
                try {
                    // Try to clear the interaction in progress
                    await instance.handleRedirectPromise();
                } catch (e) {
                    console.warn('Could not clear existing interaction:', e);
                }
            }

            // Add a small delay to ensure any pending interactions are cleared
            await new Promise(resolve => setTimeout(resolve, 100));

            await instance.logoutRedirect({
                postLogoutRedirectUri: window.location.origin + '/login',
                onRedirectNavigate: () => {
                    // Clear auth state immediately
                    isAuthenticated.set(false);
                    userAccount.set(null);
                    return true;
                }
            });
        } catch (error) {
            console.error('Logout failed:', error);
            // Force clear auth state even if logout fails
            isAuthenticated.set(false);
            userAccount.set(null);

            // Fallback: force redirect to login page
            if (browser) {
                window.location.href = '/login';
            }
        }
    }
}; 