/* src/lib/stores/authStore.ts */

import { browser } from '$app/environment';
import { writable, get } from 'svelte/store';
import { getMsalInstance, loginRequest } from '$lib/config/authConfig';
import { goto } from '$app/navigation';
import { trackEvent, cleanupTracker, setTrackerUser } from '$lib/context/tracker';
import { debugUserClaims } from '$lib/utils/claimsUtils';
import { cleanupPhotoCache } from '$lib/stores/photoStore';
import { frontendConfig } from '$frontendConfig';

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

            const response = await instance.handleRedirectPromise();
            
            if (response) {
                const account = response.account;
                if (account) {
                    instance.setActiveAccount(account);
                    isAuthenticated.set(true);
                    userAccount.set(account);
                    
                    if (account?.username) {
                        setTrackerUser(account.username);
                    }
                    
                    debugUserClaims(account);
                    
                    console.log('🔐 User authenticated:', {
                        id: account.localAccountId || account.homeAccountId,
                        name: account.name,
                        username: account.username,
                        claims: account.idTokenClaims,
                        timestamp: new Date().toISOString()
                    });
                    
                    // Redirect to home page after successful login
                    if (window.location.pathname === '/login') {
                        window.location.href = '/';
                    }
                    return true;
                }
            }

            const accounts = instance.getAllAccounts();
            if (accounts.length > 0) {
                instance.setActiveAccount(accounts[0]);
                isAuthenticated.set(true);
                userAccount.set(accounts[0]);
                
                if (accounts[0]?.username) {
                    setTrackerUser(accounts[0].username);
                }
                
                // Redirect to home page if already logged in
                if (window.location.pathname === '/login') {
                    window.location.href = '/';
                }
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
            trackEvent('Auth_Flow', { 
                step: 'login_start',
                testMode 
            });
            
            if (testMode) {
                console.log('Auth store: Test mode, bypassing MSAL');
                const testUser = {
                    name: 'Test User',
                    username: 'test@example.com',
                    homeAccountId: 'test-account',
                    environment: 'test',
                    tenantId: Bun.env.PUBLIC_AZURE_TENANT_ID,
                };

                isAuthenticated.set(true);
                userAccount.set(testUser);

                setTrackerUser(testUser.username, {
                    name: testUser.name,
                    accountId: testUser.homeAccountId,
                    environment: testUser.environment,
                    tenantId: testUser.tenantId,
                    isTestUser: true
                });

                trackEvent('Auth_Flow', {
                    step: 'login_success_test',
                    method: 'test'
                });
                isLoading.set(false);
                return;
            }

            const instance = await getMsalInstance();
            if (!instance) {
                trackEvent('Auth_Flow', { 
                    step: 'login_error',
                    error: 'msal_instance_null' 
                });
                return;
            }

            // Handle any pending redirect first
            await instance.handleRedirectPromise();

            trackEvent('Auth_Flow', { 
                step: 'redirect_start',
                method: 'microsoft' 
            });
            
            // Use loginRequest from config to ensure consistent scopes
            await instance.loginRedirect(loginRequest);
        } catch (error) {
            trackEvent('Auth_Flow', { 
                step: 'login_error',
                error: error?.message || 'unknown_error' 
            });
            console.error('Login failed:', error);
            isAuthenticated.set(false);
            userAccount.set(null);
            isLoading.set(false);
            throw error;
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