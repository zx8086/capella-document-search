import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import { getMsalInstance } from '$lib/config/authConfig';

export const isAuthenticated = writable(false);
export const isLoading = writable(false);
export const userAccount = writable(null);

export const auth = {
    async login() {
        console.log('Auth store: Starting login process...');
        try {
            const instance = await getMsalInstance();
            if (!instance) return;

            // Check if there's an ongoing interaction
            if (instance.getAllAccounts().length > 0) {
                // User is already logged in
                isAuthenticated.set(true);
                userAccount.set(instance.getAllAccounts()[0]);
                return;
            }

            // Clear any existing interaction before starting new one
            if (browser) {
                try {
                    await instance.clearCache();
                    await instance.handleRedirectPromise();
                } catch (e) {
                    console.warn('Error clearing interaction state:', e);
                }
            }

            await instance.loginRedirect({
                scopes: ['User.Read', 'email', 'openid', 'profile']
            });
        } catch (error) {
            console.error('Login failed:', error);
            isAuthenticated.set(false);
            userAccount.set(null);
            throw error;
        }
    },

    async handleRedirect() {
        if (!browser) return false;
        
        try {
            const instance = await getMsalInstance();
            if (!instance) return false;

            const response = await instance.handleRedirectPromise();
            // console.debug('Redirect response:', response);

            if (response) {
                const account = response.account;
                if (account) {
                    instance.setActiveAccount(account);
                    isAuthenticated.set(true);
                    userAccount.set(account);
                    return true;
                }
            }

            // Check if user is already logged in
            const accounts = instance.getAllAccounts();
            if (accounts.length > 0) {
                instance.setActiveAccount(accounts[0]);
                isAuthenticated.set(true);
                userAccount.set(accounts[0]);
                return true;
            }

            return false;
        } catch (error) {
            console.error('Handle redirect failed:', error);
            return false;
        }
    },

    async isAuthenticated() {
        if (!browser) return false;

        const instance = await getMsalInstance();
        if (!instance) return false;

        const accounts = instance.getAllAccounts();
        return accounts.length > 0;
    },

    async logout() {
        const instance = await getMsalInstance();
        if (!instance) return;

        try {
            await instance.logoutRedirect();
        } catch (error) {
            console.error('Logout failed:', error);
        } finally {
            isAuthenticated.set(false);
            userAccount.set(null);
        }
    }
}; 