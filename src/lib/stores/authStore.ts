import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import { getMsalInstance } from '$lib/config/authConfig';
import { identify, trackEvent } from '$lib/context/tracker';

export const isAuthenticated = writable(false);
export const userAccount = writable(null);
export const isLoading = writable(false);

async function login() {
    console.log('Auth store: Starting login process...');
    isLoading.set(true);
    try {
        const instance = await getMsalInstance();
        if (!instance) {
            throw new Error('No MSAL instance available');
        }

        if (browser) {
            trackEvent('login_attempt');
        }

        const loginRequest = {
            scopes: ['User.Read', 'profile', 'openid'],
            prompt: 'select_account'
        };

        await instance.loginRedirect(loginRequest);
        return true;
    } catch (error) {
        console.error('Login failed:', error);
        if (browser) {
            trackEvent('login_failed', { error: error.message });
        }
        return false;
    } finally {
        isLoading.set(false);
    }
}

async function handleRedirect() {
    try {
        const instance = await getMsalInstance();
        if (!instance) return false;

        const response = await instance.handleRedirectPromise();
        console.log('Redirect response:', response);

        if (response) {
            const account = response.account;
            if (account) {
                userAccount.set(account);
                isAuthenticated.set(true);

                if (browser) {
                    identify(account.username, {
                        name: account.name,
                        email: account.username,
                    });
                    trackEvent('login_success');
                }
                return true;
            }
        }

        const accounts = instance.getAllAccounts();
        console.log('Found accounts during init:', accounts.length);
        if (accounts.length > 0) {
            userAccount.set(accounts[0]);
            isAuthenticated.set(true);
            return true;
        }

        return false;
    } catch (error) {
        console.error('Handle redirect failed:', error);
        if (browser) {
            trackEvent('login_error', { error: error.message });
        }
        return false;
    }
}

async function logout() {
    console.log('Auth store: Starting logout process...');
    try {
        const instance = await getMsalInstance();
        if (!instance) return;

        if (browser) {
            trackEvent('logout_attempt');
        }

        const accounts = instance.getAllAccounts();
        if (accounts.length > 0) {
            const account = accounts[0];
            
            isAuthenticated.set(false);
            userAccount.set(null);

            if (browser) {
                trackEvent('logout_success');
            }

            await instance.logoutRedirect({
                account,
                postLogoutRedirectUri: window.location.origin + '/login'
            });
        }
    } catch (error) {
        console.error('Logout failed:', error);
        if (browser) {
            trackEvent('logout_failed', { error: error.message });
        }
        
        // Emergency cleanup
        sessionStorage.clear();
        isAuthenticated.set(false);
        userAccount.set(null);
        window.location.href = '/login';
    }
}

export const auth = {
    login,
    logout,
    handleRedirect,
    initialize: handleRedirect
}; 