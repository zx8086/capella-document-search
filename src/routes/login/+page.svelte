<script lang="ts">
    import { auth, isLoading, isAuthenticated } from '$lib/stores/authStore';
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    // import { inspect } from 'svelte/internal';

    let loginAttempts = 0;

    async function handleLogin() {
        if ($isLoading) return;
        
        $isLoading = true;
        try {
            loginAttempts++;
            if (loginAttempts > 1) {
                await auth.logout();
            }
            await auth.login();
        } catch (error) {
            console.error('Login failed:', error?.message || error);
        } finally {
            $isLoading = false;
        }
    }

    onMount(async () => {
        try {
            await auth.initialize();
            if ($isAuthenticated) {
                await goto('/', { replaceState: true });
                return;
            }
            await auth.handleRedirectPromise();
        } catch (error) {
            // console.error('Redirect handling error:', inspect(error));
        }
    });
</script>
<svelte:head>
    <title>Capella Document Search</title>
    <meta name="Capella Document Search" content="Capella Document Search" />
</svelte:head>
{#if !$isLoading}
    <div class="flex min-h-screen items-center justify-center bg-gray-50">
        <div class="w-full max-w-md space-y-8 rounded-lg bg-white p-6 shadow-lg">
            <div class="text-center">
                <h2 class="text-3xl font-bold tracking-tight text-gray-900">
                    Welcome to Capella Document Search
                </h2>
                <p class="mt-2 text-sm text-gray-600">
                    Please sign in with your PVH account
                </p>
            </div>

            <div class="mt-8">
                <button
                    type="button"
                    on:click={handleLogin}
                    disabled={$isLoading}
                    class="group relative flex w-full justify-center rounded-md bg-[#00174f] px-3 py-2 text-sm font-semibold text-white hover:bg-[#001140] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00174f] disabled:opacity-50 disabled:cursor-not-allowed"
                    data-transaction-name="Sign In button"
                >
                    {#if $isLoading}
                        <span class="absolute inset-y-0 left-0 flex items-center pl-3">
                            <!-- Loading spinner -->
                            <svg
                                class="h-5 w-5 animate-spin text-white"
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                            >
                                <circle
                                    class="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    stroke-width="4"
                                />
                                <path
                                    class="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                            </svg>
                        </span>
                        Signing in...
                    {:else}
                        <span class="absolute inset-y-0 left-0 flex items-center pl-3">
                            <!-- Microsoft icon -->
                            <svg
                                class="h-5 w-5 text-white"
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 48 48"
                            >
                                <path fill="#ff5722" d="M6 6h16v16H6z" />
                                <path fill="#4caf50" d="M26 6h16v16H26z" />
                                <path fill="#ffc107" d="M6 26h16v16H6z" />
                                <path fill="#03a9f4" d="M26 26h16v16H26z" />
                            </svg>
                        </span>
                        Sign in with Microsoft Azure ID
                    {/if}
                </button>
            </div>
        </div>
    </div>
{:else}
    <div class="fixed inset-0 bg-white flex items-center justify-center z-50">
        <div class="animate-spin rounded-full h-12 w-12 border-2 border-[#00174f] border-t-transparent"></div>
    </div>
{/if} 