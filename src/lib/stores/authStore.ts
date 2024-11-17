import { browser } from '$app/environment';
import { writable, get } from 'svelte/store';
import { getMsalInstance } from '$lib/config/authConfig';

export const isAuthenticated = writable(false);
export const isLoading = writable(true);
export const userAccount = writable(null);

export const auth = {
    async initialize() {
        if (!browser) return false;
        
        try {
            isLoading.set(true);
            const instance = await getMsalInstance();
            if (!instance) return false;

            const response = await instance.handleRedirectPromise();
            
            if (response) {
                const account = response.account;
                if (account) {
                    instance.setActiveAccount(account);
                    isAuthenticated.set(true);
                    userAccount.set(account);
                    return true;
                }
            }

            const accounts = instance.getAllAccounts();
            if (accounts.length > 0) {
                instance.setActiveAccount(accounts[0]);
                isAuthenticated.set(true);
                userAccount.set(accounts[0]);
                return true;
            }

            isAuthenticated.set(false);
            userAccount.set(null);
            return false;
        } catch (error) {
            console.error('Auth initialization failed:', error);
            isAuthenticated.set(false);
            userAccount.set(null);
            return false;
        } finally {
            isLoading.set(false);
        }
    },

    checkAuth() {
        return get(isAuthenticated);
    },

    async login(testMode = false) {
        console.log('Auth store: Starting login process...');
        try {
            isLoading.set(true);
            
            if (testMode) {
                console.log('Auth store: Test mode, bypassing MSAL');
                isAuthenticated.set(true);
                userAccount.set({
                    name: 'Test User',
                    username: 'test@example.com',
                    homeAccountId: 'test-account',
                    environment: 'test',
                    tenantId: Bun.env.PUBLIC_AZURE_TENANT_ID,
                });
                isLoading.set(false);
                return;
            }

            const instance = await getMsalInstance();
            if (!instance) return;

            await instance.loginRedirect({
                scopes: ['User.Read', 'email', 'openid', 'profile']
            });
        } catch (error) {
            console.error('Login failed:', error);
            isAuthenticated.set(false);
            userAccount.set(null);
            isLoading.set(false);
            throw error;
        }
    },

    async logout() {
        try {
            isLoading.set(true);
            const instance = await getMsalInstance();
            if (!instance) return;

            await instance.logoutRedirect();
        } catch (error) {
            console.error('Logout failed:', error);
        } finally {
            isAuthenticated.set(false);
            userAccount.set(null);
            isLoading.set(false);
        }
    }
}; 