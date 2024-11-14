import { writable } from 'svelte/store';
import { getMsalInstance, loginRequest } from '../config/authConfig';
import type { AccountInfo } from '@azure/msal-browser';
import { browser } from '$app/environment';

export const isAuthenticated = writable(false);
export const userAccount = writable<AccountInfo | null>(null);
export const isLoading = writable(false);

export const auth = {
    async initialize() {
        try {
            const instance = await getMsalInstance();
            if (!instance) return false;
            
            const accounts = instance.getAllAccounts();
            if (accounts.length > 0) {
                try {
                    const tokenResponse = await instance.acquireTokenSilent({
                        ...loginRequest,
                        account: accounts[0]
                    });
                    
                    instance.setActiveAccount(accounts[0]);
                    isAuthenticated.set(true);
                    userAccount.set(accounts[0]);

                    // Set authentication cookie
                    if (browser) {
                        document.cookie = `auth=${tokenResponse.accessToken}; path=/; secure; samesite=strict`;
                    }
                    
                    return true;
                } catch (tokenError) {
                    console.warn('Token validation failed:', tokenError);
                    instance.removeAccount(accounts[0]);
                    isAuthenticated.set(false);
                    userAccount.set(null);
                    return false;
                }
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
            if (!instance) throw new Error('MSAL not initialized');
            
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
            if (!instance) return false;

            const response = await instance.handleRedirectPromise();
            if (response) {
                instance.setActiveAccount(response.account);
                isAuthenticated.set(true);
                userAccount.set(response.account);

                // Set authentication cookie
                if (browser) {
                    document.cookie = `auth=${response.accessToken}; path=/; secure; samesite=strict`;
                }
                
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
            if (!instance) return;
            
            // Clear cookies and session storage
            if (browser) {
                document.cookie = 'auth=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT';
                sessionStorage.clear();
            }
            
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