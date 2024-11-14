import { writable } from 'svelte/store';
import { getMsalInstance, loginRequest } from '../config/authConfig';
import type { AccountInfo } from '@azure/msal-browser';
import { goto } from '$app/navigation';

export const isAuthenticated = writable(false);
export const userAccount = writable<AccountInfo | null>(null);
export const isLoading = writable(false);

export const auth = {
    async initialize() {
        try {
            const instance = await getMsalInstance();
            
            // Check for existing account first
            const accounts = instance.getAllAccounts();
            if (accounts.length > 0) {
                // Validate the account's token
                try {
                    await instance.acquireTokenSilent({
                        ...loginRequest,
                        account: accounts[0]
                    });
                    instance.setActiveAccount(accounts[0]);
                    isAuthenticated.set(true);
                    userAccount.set(accounts[0]);
                    return true;
                } catch (tokenError) {
                    // Token is invalid or expired
                    console.warn('Token validation failed:', tokenError);
                    instance.removeAccount(accounts[0]);
                    isAuthenticated.set(false);
                    userAccount.set(null);
                    return false;
                }
            }

            // Then try to handle any pending redirects
            try {
                const response = await instance.handleRedirectPromise();
                if (response) {
                    instance.setActiveAccount(response.account);
                    isAuthenticated.set(true);
                    userAccount.set(response.account);
                    return true;
                }
            } catch (redirectError) {
                console.warn('Redirect handling failed:', redirectError);
            }

            return false;
        } catch (error) {
            console.error('Failed to initialize auth:', error);
            return false;
        }
    },

    async login() {
        isLoading.set(true);
        try {
            const instance = await getMsalInstance();
            // Store the current path to return to after login
            sessionStorage.setItem('loginRedirectPath', window.location.pathname);
            await instance.loginRedirect(loginRequest);
        } catch (error) {
            console.error('Login failed:', error);
            isLoading.set(false);
            throw error;
        }
    },

    async handleRedirectPromise() {
        try {
            const instance = await getMsalInstance();
            const response = await instance.handleRedirectPromise();
            
            if (response) {
                instance.setActiveAccount(response.account);
                isAuthenticated.set(true);
                userAccount.set(response.account);
                
                // Restore the previous path if available
                const redirectPath = sessionStorage.getItem('loginRedirectPath') || '/';
                sessionStorage.removeItem('loginRedirectPath');
                await goto(redirectPath);
                
                return true;
            }
            return false;
        } catch (error) {
            console.error('Handle redirect failed:', error);
            return false;
        }
    },

    async logout() {
        try {
            const instance = await getMsalInstance();
            // Clear session storage before logout
            sessionStorage.clear();
            await instance.logoutRedirect({
                postLogoutRedirectUri: window.location.origin + '/login'
            });
            isAuthenticated.set(false);
            userAccount.set(null);
        } catch (error) {
            console.error('Logout failed:', error);
        }
    }
}; 