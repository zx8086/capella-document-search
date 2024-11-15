<script lang="ts">
    import { auth, isLoading, isAuthenticated } from '$lib/stores/authStore';
    import { toast } from 'svelte-sonner';
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';

    let loginAttempts = 0;

    async function handleLogin() {
        console.log('Login button clicked, starting login process...');
        try {
            loginAttempts++;
            console.log(`Login attempt #${loginAttempts}`);
            
            if (loginAttempts > 1) {
                console.log('Multiple login attempts detected, logging out first...');
                await auth.logout();
            }

            console.log('Calling auth.login()...');
            await auth.login();
        } catch (error) {
            console.error('Login error in component:', error);
            toast.error('Login failed. Please try again.');
        }
    }

    onMount(async () => {
        console.log('Login page mounted');
        try {
            console.log('Initializing auth on login page...');
            await auth.initialize();
            
            console.log('Handling any pending redirects...');
            const redirectResult = await auth.handleRedirectPromise();
            console.log('Redirect result:', redirectResult);
            
            if ($isAuthenticated) {
                console.log('User is already authenticated, redirecting...');
                const redirectPath = sessionStorage.getItem('loginRedirectPath') || '/';
                sessionStorage.removeItem('loginRedirectPath');
                await goto(redirectPath, { replaceState: true });
                return;
            }
            
            if (redirectResult) {
                console.log('Successful redirect, navigating to app...');
                const redirectPath = sessionStorage.getItem('loginRedirectPath') || '/';
                sessionStorage.removeItem('loginRedirectPath');
                await goto(redirectPath, { replaceState: true });
            }
        } catch (error) {
            console.error('Redirect handling error:', error);
            toast.error('Authentication failed. Please try again.');
        }
    });
</script>

<div class="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
    <div class="p-8 bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-md">
        <div class="text-center mb-8">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Welcome to Couchbase Capella Document Search
            </h1>
            <p class="text-gray-600 dark:text-gray-300">
                Please sign in with your PVH account to continue
            </p>
        </div>

        <button
            on:click={handleLogin}
            disabled={$isLoading}
            class="w-full flex items-center justify-center gap-3 bg-[#00174f] text-white py-3 px-4 rounded-lg hover:bg-[#002280] transition-colors duration-200"
            data-transaction-name="Login Button"
        >
            {#if $isLoading}
                <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
            {/if}
            Sign in with Microsoft
        </button>
    </div>
</div> 