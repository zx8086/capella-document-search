import { writable } from 'svelte/store';
import { getMsalInstance, loginRequest } from '../config/authConfig';
import type { AccountInfo } from '@azure/msal-browser';
import { browser } from '$app/environment';
import { parseTokenClaims, validateTokenClaims } from '$lib/utils/claimsUtils';
import { log } from '$lib/utils/logger';

export const isAuthenticated = writable(false);
export const userAccount = writable<AccountInfo | null>(null);
export const isLoading = writable(false);

export const auth = {
    async initialize() {
        console.log('Initializing auth...');
        try {
            const instance = await getMsalInstance();
            if (!instance) return false;

            // Handle any pending redirects first
            const response = await instance.handleRedirectPromise();
            console.log('Redirect response:', response);

            const accounts = instance.getAllAccounts();
            console.log('Found accounts during init:', accounts.length);

            if (accounts.length > 0) {
                const account = accounts[0];
                console.log('Setting active account:', account.username);
                instance.setActiveAccount(account);
                isAuthenticated.set(true);
                userAccount.set(account);
                return true;
            } else if (response) {
                // If we have a response but no accounts, try to set the account from the response
                console.log('Setting account from response');
                const account = response.account;
                if (account) {
                    instance.setActiveAccount(account);
                    isAuthenticated.set(true);
                    userAccount.set(account);
                    return true;
                }
            }

            return false;
        } catch (error) {
            console.error('Auth initialization failed:', error);
            return false;
        }
    },

    async login() {
        console.log('Auth store: Starting login process...');
        try {
            const instance = await getMsalInstance();
            if (!instance) {
                throw new Error('No MSAL instance available');
            }
            console.log('MSAL instance available for login:', !!instance);

            const loginRequest = {
                scopes: ['User.Read', 'profile', 'openid'],
                prompt: 'select_account' // Force account selection
            };

            console.log('Login request config:', loginRequest);
            console.log('Initiating login redirect...');

            // Clear any existing auth state
            sessionStorage.removeItem('msal.interaction.status');
            
            await instance.loginRedirect(loginRequest);
            return true;
        } catch (error) {
            console.error('Login failed:', error);
            return false;
        }
    },

    async handleRedirectPromise() {
        console.log('Handling redirect promise...');
        try {
            const instance = await getMsalInstance();
            if (!instance) return false;

            const response = await instance.handleRedirectPromise();
            console.log('Redirect response:', !!response);
            
            if (response) {
                console.log('Setting active account...');
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
        console.log('Auth store: Starting logout process...');
        try {
            const instance = await getMsalInstance();
            if (!instance) {
                console.warn('No MSAL instance available for logout');
                return;
            }

            // Get all accounts before clearing anything
            const accounts = instance.getAllAccounts();
            console.log('Found accounts:', accounts.length);

            if (accounts.length > 0) {
                const account = accounts[0];
                
                try {
                    // Clear our state first
                    isAuthenticated.set(false);
                    userAccount.set(null);

                    // Attempt MSAL logout with the current account
                    await instance.logoutRedirect({
                        account: account,
                        postLogoutRedirectUri: window.location.origin + '/login',
                        onRedirectNavigate: (url) => {
                            console.log('Redirecting to:', url);
                            return true; // Allow redirect
                        }
                    });

                    // If we get here, something went wrong with the redirect
                    console.warn('Logout redirect did not occur, falling back to manual cleanup');
                } catch (error) {
                    console.error('MSAL logout failed:', error);
                }
            }

            // Fallback cleanup if MSAL logout fails
            console.log('Performing manual cleanup...');
            
            // Clear MSAL cache
            instance.clearCache();
            instance.setActiveAccount(null);

            // Clear session storage but preserve MSAL config
            const clientId = instance.getConfiguration().auth.clientId;
            const msalConfig = sessionStorage.getItem(`msal.${clientId}.config`);
            
            sessionStorage.clear();
            
            if (msalConfig) {
                sessionStorage.setItem(`msal.${clientId}.config`, msalConfig);
            }

            // Force redirect if MSAL redirect didn't work
            if (browser) {
                window.location.href = '/login';
            }

        } catch (error) {
            console.error('Logout failed:', error);
            
            // Emergency cleanup
            if (browser) {
                sessionStorage.clear();
                isAuthenticated.set(false);
                userAccount.set(null);
                window.location.href = '/login';
            }
        }
    }
}; 