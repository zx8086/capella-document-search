import { browser } from '$app/environment';
import { writable, get } from 'svelte/store';
import { getMsalInstance } from '$lib/config/authConfig';
import { goto } from '$app/navigation';
import { trackEvent, cleanupTracker, setTrackerUser } from '$lib/context/tracker';
import { debugUserClaims } from '$lib/utils/claimsUtils';

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

            trackEvent('Auth_Flow', { 
                step: 'redirect_start',
                method: 'microsoft' 
            });
            
            await instance.loginRedirect({
                scopes: [
                    'User.Read',
                    'User.ReadBasic.All',
                    'email',
                    'openid',
                    'profile',
                    'user.read.all',
                    'user.read'
                ]
            });
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
            cleanupTracker();
            await instance.logoutRedirect();
            isAuthenticated.set(false);
            userAccount.set(null);
        } catch (error) {
            console.error('Logout error:', error);
            window.location.href = '/login';
        } finally {
            isLoading.set(false);
        }
    }
}; 