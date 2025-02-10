/* src/lib/stores/authStore.ts */

import { browser } from '$app/environment';
import { writable, get } from 'svelte/store';
import { getMsalInstance, loginRequest, clearMsalCache, isSafari } from '$lib/config/authConfig';
import { goto } from '$app/navigation';
import { trackEvent, cleanupTracker, setTrackerUser } from '$lib/context/tracker';
import { debugUserClaims } from '$lib/utils/claimsUtils';
import { cleanupPhotoCache } from '$lib/stores/photoStore';
import { frontendConfig } from '$frontendConfig';
import { getTracker } from '$lib/context/tracker';

export const isAuthenticated = writable(false);
export const isLoading = writable(true);
export const userAccount = writable(null);
export const trackerLoading = writable(false);

export const auth = {
    async initialize() {
        if (!browser) return false;
        
        try {
            isLoading.set(true);
            trackerLoading.set(true);
            
            const instance = await getMsalInstance();
            if (!instance) return false;

            // Handle redirect promise with error handling
            const response = await instance.handleRedirectPromise()
                .catch(error => {
                    console.warn('Redirect promise error:', error);
                    return null;
                });
            
            if (response) {
                console.log('Successful response from redirect:', response);
                const account = response.account;
                userAccount.set(account);
                isAuthenticated.set(true);
                return true;
            }

            // Check if we have an active account
            const accounts = instance.getAllAccounts();
            if (accounts.length > 0) {
                console.log('Found existing account:', accounts[0]);
                userAccount.set(accounts[0]);
                isAuthenticated.set(true);
                return true;
            }

            return false;
        } catch (error) {
            console.error('Auth initialization failed:', error);
            isAuthenticated.set(false);
            userAccount.set(null);
            return false;
        } finally {
            isLoading.set(false);
            trackerLoading.set(false);
        }
    },

    checkAuth() {
        return get(isAuthenticated);
    },

    async login(testMode = false) {
        console.log('Auth store: Starting login process...');
        try {
            isLoading.set(true);
            
            const instance = await getMsalInstance();
            if (!instance) {
                throw new Error('MSAL instance not initialized');
            }

            // Clear any existing tokens
            clearMsalCache();

            // Handle Safari with fallback
            if (isSafari()) {
                console.log('Safari detected, using standard redirect flow...');
                trackEvent('Auth_Flow', { 
                    step: 'redirect_start',
                    method: 'standard' 
                });
                
                const loginRequestWithState = {
                    ...loginRequest,
                    state: Date.now().toString(),
                    prompt: 'select_account'
                };

                await instance.loginRedirect(loginRequestWithState);
                return;
            }

            // Standard flow for other browsers
            trackEvent('Auth_Flow', { 
                step: 'redirect_start',
                method: 'standard' 
            });
            
            const loginRequestWithState = {
                ...loginRequest,
                state: Date.now().toString(),
                prompt: 'select_account'
            };

            await instance.loginRedirect(loginRequestWithState);
        } catch (error) {
            console.error('Login failed:', error);
            trackEvent('Auth_Flow', { 
                step: 'error',
                error: error?.message || 'unknown_error',
                browser: isSafari() ? 'safari' : 'other'
            });
            isAuthenticated.set(false);
            userAccount.set(null);
            throw error;
        } finally {
            isLoading.set(false);
        }
    },

    async logout() {
        if (!browser) return;
        
        try {
            isLoading.set(true);
            const instance = await getMsalInstance();
            
            if (instance) {
                // Clear application state first
                cleanupTracker();
                cleanupPhotoCache();
                isAuthenticated.set(false);
                userAccount.set(null);

                // Get active account
                const activeAccount = instance.getActiveAccount();
                
                // Clear MSAL state
                instance.setActiveAccount(null);
                
                // For Chrome, clear all browser storage first
                if (navigator.userAgent.includes('Chrome')) {
                    localStorage.clear();
                    sessionStorage.clear();
                    document.cookie.split(';').forEach(cookie => {
                        document.cookie = cookie.replace(/^ +/, '').replace(/=.*/, `=;expires=${new Date().toUTCString()};path=/`);
                    });
                }

                // Perform logout
                await instance.logoutRedirect({
                    account: activeAccount,
                    postLogoutRedirectUri: window.location.origin + '/login'
                });
            } else {
                window.location.href = '/login';
            }
        } catch (error) {
            console.error('Logout error:', error);
            // Force a clean redirect for Chrome
            if (navigator.userAgent.includes('Chrome')) {
                window.location.replace('/login');
            } else {
                window.location.href = '/login';
            }
        } finally {
            isLoading.set(false);
        }
    }
}; 