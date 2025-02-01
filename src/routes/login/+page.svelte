<script lang="ts">
    import { auth, isLoading, isAuthenticated, trackerLoading } from '$lib/stores/authStore';
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { initTracker } from '$lib/context/tracker';

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

    // Initialize Tracker After Login
    onMount(async () => {
        try {
            // Initialize tracker first, before auth
            $trackerLoading = true;
            await initTracker();
            
            // Then initialize auth
            await auth.initialize();
            if ($isAuthenticated) {
                await goto('/', { replaceState: true });
            }
        } catch (error) {
            console.error('Initialization error:', error);
        } finally {
            $trackerLoading = false;
        }
    });

    onMount(() => {
        // Debug CSS locations
        const styleSheets = Array.from(document.styleSheets);
        console.log('🎨 CSS Files:', styleSheets.map(sheet => ({
            href: sheet.href,
            ownerNode: sheet.ownerNode?.nodeName,
            rules: sheet.cssRules?.length
        })));

        // Debug JS files that might contain CSS
        const scripts = Array.from(document.scripts);
        console.log('📜 Script Files:', scripts.map(script => ({
            src: script.src,
            type: script.type,
            module: script.type === 'module'
        })));

        // Log all asset URLs from /_app/immutable
        const immutableAssets = Array.from(document.querySelectorAll('link[href*="/_app/immutable"], script[src*="/_app/immutable"]'));
        console.log('🔒 Immutable Assets:', immutableAssets.map(el => ({
            type: el.nodeName,
            url: el.getAttribute('href') || el.getAttribute('src')
        })));

        // Debug all <link> and <style> tags
        console.log('📝 Style Elements:', Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(el => ({
            type: el.nodeName,
            href: el.getAttribute('href'),
            textLength: el.textContent?.length || 0,
            firstRules: el.textContent?.slice(0, 100) + '...'
        })));

        // More comprehensive CSS loading checks
        const checkStyles = () => {
            // 1. Check all stylesheets
            const styleSheets = Array.from(document.styleSheets).map(sheet => ({
                href: sheet.href,
                rules: sheet.cssRules?.length,
                loaded: !!sheet.cssRules?.length,
                type: sheet.ownerNode?.nodeName,
                media: sheet.media.mediaText
            }));

            // 2. Check critical Tailwind classes
            const criticalClasses = [
                'bg-[#00174f]',
                'text-white',
                'container',
                'rounded-lg'
            ];

            const computedStyles = criticalClasses.map(className => {
                const testDiv = document.createElement('div');
                testDiv.className = className;
                document.body.appendChild(testDiv);
                const styles = window.getComputedStyle(testDiv);
                const computed = {
                    className,
                    backgroundColor: styles.backgroundColor,
                    color: styles.color,
                    display: styles.display
                };
                document.body.removeChild(testDiv);
                return computed;
            });

            // 3. Check if styles are actually applying
            const styleCheck = {
                totalStylesheets: styleSheets.length,
                loadedStylesheets: styleSheets.filter(s => s.loaded).length,
                tailwindLoaded: styleSheets.some(s => 
                    s.rules && Array.from(s.rules).some(rule => 
                        rule.cssText?.includes('@tailwind') || 
                        rule.cssText?.includes('--tw-') ||
                        rule.cssText?.includes('container') ||
                        rule.cssText?.includes('text-white') ||
                        rule.cssText?.includes('bg-[#00174f]')
                    )
                ),
                criticalStylesApplied: computedStyles.every(style => 
                    style.backgroundColor !== 'rgba(0, 0, 0, 0)' || 
                    style.color !== 'rgb(0, 0, 0)' ||
                    style.className === 'container'
                ),
                styleValues: computedStyles.reduce((acc, style) => ({
                    ...acc,
                    [style.className]: {
                        backgroundColor: style.backgroundColor,
                        color: style.color,
                        display: style.display
                    }
                }), {}),
                details: {
                    styleSheets,
                    computedStyles
                }
            };

            console.log('🎨 OpenReplay Style Check:', styleCheck);

            // 4. Alert if there are issues
            if (!styleCheck.criticalStylesApplied) {
                console.error('⚠️ Critical styles not applying:', styleCheck.styleValues);
            }
        };

        // Check immediately and after a delay to catch any async loading
        checkStyles();
        setTimeout(checkStyles, 2000);
        
        // Also check when window loads
        window.addEventListener('load', checkStyles);
        
        // Check if styles change
        const observer = new MutationObserver((mutations) => {
            const hasStyleChanges = mutations.some(mutation => 
                mutation.target.nodeName === 'STYLE' || 
                mutation.target.nodeName === 'LINK'
            );
            if (hasStyleChanges) {
                console.log('🔄 Style changes detected, rechecking...');
                checkStyles();
            }
        });

        observer.observe(document.head, {
            childList: true,
            subtree: true
        });

        return () => {
            observer.disconnect();
            window.removeEventListener('load', checkStyles);
        };
    });

</script>
<svelte:head>
    <title>Capella Document Search</title>
    <meta name="Capella Document Search" content="Capella Document Search" />
</svelte:head>
{#if !$isLoading && !$trackerLoading}
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
                    onclick={handleLogin}
                    disabled={$isLoading}
                    class="group relative flex w-full justify-center rounded-md bg-[#00174f] px-3 py-2 text-sm font-semibold text-white hover:bg-[#001140] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00174f] disabled:opacity-50 disabled:cursor-not-allowed"
                    data-transaction-name="Sign In button"
                    name="login-button"
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
        <div class="flex flex-col items-center">
            <div class="animate-spin rounded-full h-12 w-12 border-2 border-[#00174f] border-t-transparent"></div>
            <p class="mt-4 text-gray-600">
                {$trackerLoading ? 'Initializing tracking...' : 'Loading...'}
            </p>
        </div>
    </div>
{/if} 