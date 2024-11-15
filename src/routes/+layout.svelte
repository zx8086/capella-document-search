<!-- src/routes/+layout.svelte -->

<script lang="ts">
    import { run } from 'svelte/legacy';
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    import { getMsalInstance } from '$lib/config/authConfig';

    import "../app.css";
    import "../apm-config";
    import * as Drawer from "$lib/components/ui/drawer";
    import { Button } from "$lib/components/ui/button";
    import { Toaster } from "$lib/components/ui/sonner";
    import { onMount, setContext, onDestroy } from "svelte";
    import { browser } from "$app/environment";
    import { key, initTracker } from "$lib/context/tracker";
    import { frontendConfig } from "$frontendConfig";
    import { writable } from "svelte/store";
    import { collections } from "../stores/collectionsStore";
    import { auth } from '$lib/stores/authStore';
    interface Props {
        children?: import('svelte').Snippet;
    }

    let { children }: Props = $props();

    let pollInterval: ReturnType<typeof setInterval>;

    let tracker: any | null = null;
    let isTrackerInitialized = false;

    const darkMode = writable(false);

    function applyDarkMode(isDark: boolean) {
        if (browser) {
            if (isDark) {
                document.documentElement.classList.add("dark");
            } else {
                document.documentElement.classList.remove("dark");
            }
        }
    }

    run(() => {
        if (browser) {
            applyDarkMode($darkMode);
        }
    });

    async function initializeTracker() {
        if (isTrackerInitialized) return tracker;
        if (browser) {
            try {
                const TrackerClass = await initTracker();
                if (TrackerClass && frontendConfig.openreplay.PROJECT_KEY) {
                    tracker = new TrackerClass({
                        projectKey: frontendConfig.openreplay.PROJECT_KEY,
                        ingestPoint: frontendConfig.openreplay.INGEST_POINT,
                        obscureTextNumbers: false,
                        obscureTextEmails: true,
                        __DISABLE_SECURE_MODE: true,
                        network: {
                            capturePayload: true,
                            sessionTokenHeader: false,
                            failuresOnly: false,
                            ignoreHeaders: [
                                "Authorization",
                                "Cookie",
                                "Set-Cookie",
                            ],
                            captureInIframes: false,
                        },
                        capturePerformance: true,
                        respectDoNotTrack: false,
                    });

                    // Start the tracker
                    tracker.start();
                } else {
                    console.warn(
                        "OpenReplay configuration is missing or incomplete.",
                        {
                            TrackerClass,
                            projectKey: frontendConfig.openreplay.PROJECT_KEY,
                        },
                    );
                }
            } catch (error) {
                console.warn(
                    "OpenReplay initialization failed:",
                    error instanceof Error ? error.message : String(error),
                );
            }
        }
        isTrackerInitialized = true;
        return tracker;
    }

    function getTracker() {
        return tracker;
    }

    setContext(key, { getTracker });

    let quotes = [
        {
            text: `Prove by Doing !`,
        },
        {
            text: "First make it Work, then make it Better, then make it Beautiful !",
        },
        {
            text: `It's not possible ! - "No, it is necessary !" (No Time For Caution) !`,
        },
        {
            text: "#TEGID - The Enemy's Gate Is Down !",
        },
        {
            text: "De-coupled & Agnostic !",
        },
        {
            text: "We Build it, We Support it !",
        },
        {
            text: "The way you do Anything, is the way you do Everything !",
        },
    ];

    let currentQuoteIndex = $state(0);
    let isPaused = $state(false);
    let autoplayIntervalTime = 4000;
    let autoplayInterval: ReturnType<typeof setInterval> | null = null;

    function nextQuote() {
        currentQuoteIndex = (currentQuoteIndex + 1) % quotes.length;
    }

    // function previousQuote() {
    //     currentQuoteIndex =
    //         (currentQuoteIndex - 1 + quotes.length) % quotes.length;
    // }

    function startAutoplay() {
        if (autoplayInterval) clearInterval(autoplayInterval);
        autoplayInterval = setInterval(() => {
            if (!isPaused) {
                nextQuote();
            }
        }, autoplayIntervalTime);
    }

    function togglePause() {
        isPaused = !isPaused;
    }

    onMount(async () => {
        startAutoplay();
        try {
            const trackerInstance = await initializeTracker();
            if (trackerInstance) {
                await trackerInstance.start({
                    userID: "simonowusu@pvh.com",
                    metadata: {
                        balance: "10M",
                        plan: "free",
                    },
                });
            }
        } catch (error) {
            console.warn(
                "Failed to start OpenReplay:",
                error instanceof Error ? error.message : String(error),
            );
        }

        collections.fetchCollections(); // Initial fetch
        pollInterval = setInterval(
            () => {
                collections.fetchCollections();
            },
            60 * 60 * 1000,
        ); // Poll every 60 minutes
    });

    onDestroy(() => {
        if (autoplayInterval) clearInterval(autoplayInterval);

        if (pollInterval) clearInterval(pollInterval);
    });

    function groupCollectionsByScope(collections: Collection[]): Record<string, Collection[]> {
        // Create a new array instead of mutating the input
        const sortedCollections = [...collections].sort((a, b) => {
            if (a.scope_name < b.scope_name) return -1;
            if (a.scope_name > b.scope_name) return 1;
            if (a.collection_name < b.collection_name) return -1;
            if (a.collection_name > b.collection_name) return 1;
            return 0;
        });

        return sortedCollections.reduce((acc, collection) => {
            // Create a new object instead of mutating the accumulator
            if (!acc[collection.scope_name]) {
                acc[collection.scope_name] = [];
            }
            acc[collection.scope_name] = [...acc[collection.scope_name], collection];
            return acc;
        }, {} as Record<string, Collection[]>);
    }

    // Change the derived value to a computed value
    const groupedCollections = $derived(() => groupCollectionsByScope(allCollections));

    async function signOut() {
        try {
            await auth.logout();
        } catch (error) {
            console.error('Sign out error:', error);
            // Force redirect to login page if logout fails
            window.location.href = '/login';
        }
    }
</script>

<div class="flex flex-col min-h-screen">
    <!-- Header Section -->
<!-- Header Section -->
<header class="bg-[#00174f] text-white py-4">
    <div class="container mx-auto px-4">
        <div class="flex justify-between items-center">
            <!-- Left column (empty for balance) -->
            <div class="w-1/4"></div>

            <!-- Middle column (title) -->
            <div class="w-1/2 text-center">
                <h1 class="text-xl">Couchbase Capella Document Search</h1>
            </div>

            <!-- Right column (sign out button) -->
            <div class="w-1/4 flex justify-end items-center space-x-2">
                {#if $page.url.pathname !== '/login'}
                    <button
                        type="button"
                        onclick={() => signOut()}
                        class="flex items-center space-x-2 px-4 py-2 text-sm text-white hover:text-gray-200 transition-colors"
                        data-transaction-name="Sign Out button"
                    >
                        <span>Sign Out</span>
                        <svg 
                            xmlns="http://www.w3.org/2000/svg" 
                            fill="none" 
                            viewBox="0 0 24 24" 
                            stroke-width="1.5" 
                            stroke="currentColor" 
                            class="w-5 h-5"
                        >
                            <path 
                                stroke-linecap="round" 
                                stroke-linejoin="round" 
                                d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" 
                            />
                        </svg>
                    </button>
                {/if}
            </div>
        </div>
    </div>
</header>

    <!-- Main Content -->
    <main
        class="flex-grow bg-white dark:bg-[#2C2C2C] transition-colors duration-300"
    >
        <Toaster
            expand
            visibleToasts={5}
            richColors
            closeButton
            toastOptions={{
                unstyled: true,
                classes: {
                    toast: "bg-white dark:bg-gray-800 text-gray-900 dark:text-white !p-4 !min-w-[300px] !rounded-lg !shadow-lg !font-sans",
                    title: "font-medium text-base",
                    description: "text-sm",
                    actionButton: "bg-[#00174f] text-white",
                    cancelButton: "bg-gray-200 text-gray-900",
                    closeButton:
                        "text-gray-400 hover:text-gray-900 dark:hover:text-white",
                },
            }}
        />
        {@render children?.()}
    </main>

    <!-- Footer Section -->
    <footer class="bg-[#00174f] text-white py-4 mt-8">
        <div class="container mx-auto px-4">
            <div class="flex justify-between items-center">
                <!-- Copyright and B2B Platform Engineering -->
                <div class="flex-grow text-center">
                    <div>
                        &copy; {new Date().getFullYear()} PVH. Powered by
                        <Drawer.Root>
                            <Drawer.Trigger>
                                <span class="cursor-pointer underline text-lg"
                                    >B2B Platform Engineering</span
                                >
                            </Drawer.Trigger>
                            <Drawer.Content
                                class="h-[33vh] sm:h-[40vh] bg-[#00174f] text-white"
                            >
                                <Drawer.Header>
                                    <Drawer.Title class="text-3xl font-bold"
                                        >B2B Platform Engineering</Drawer.Title
                                    >
                                    <Drawer.Description
                                        class="text-gray-300 text-lg"
                                        >Mottos we work by...</Drawer.Description
                                    >
                                </Drawer.Header>
                                <div class="p-4 h-full flex flex-col">
                                    <!-- Quote Carousel -->
                                    <div
                                        class="relative w-full flex-grow overflow-hidden"
                                    >
                                        <div
                                            class="absolute inset-0 flex items-center justify-center"
                                        >
                                            {#each quotes as quote, index}
                                                <div
                                                    class="absolute inset-0 flex flex-col items-center justify-center text-center p-4 transition-opacity duration-1000"
                                                    class:opacity-100={currentQuoteIndex ===
                                                        index}
                                                    class:opacity-0={currentQuoteIndex !==
                                                        index}
                                                >
                                                    <p
                                                        class="text-8xl font-bold mb-4"
                                                    >
                                                        "{quote.text}"
                                                    </p>
                                                </div>
                                            {/each}
                                        </div>

                                        <!-- Pause/Play Button -->
                                        <button
                                            type="button"
                                            data-transaction-name="Toggle Pause button"
                                            class="absolute bottom-4 right-4 z-20 rounded-full text-white opacity-50 hover:opacity-80 focus:opacity-80"
                                            onclick={togglePause}
                                            aria-label={isPaused
                                                ? "Play carousel"
                                                : "Pause carousel"}
                                        >
                                            {#if isPaused}
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    viewBox="0 0 20 20"
                                                    fill="currentColor"
                                                    aria-hidden="true"
                                                    class="w-8 h-8"
                                                >
                                                    <path
                                                        fill-rule="evenodd"
                                                        d="M2 10a8 8 0 1 1 16 0 8 8 0 0 1-16 0Zm6.39-2.908a.75.75 0 0 1 .766.027l3.5 2.25a.75.75 0 0 1 0 1.262l-3.5 2.25A.75.75 0 0 1 8 12.25v-4.5a.75.75 0 0 1 .39-.658Z"
                                                        clip-rule="evenodd"
                                                    />
                                                </svg>
                                            {:else}
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    viewBox="0 0 20 20"
                                                    fill="currentColor"
                                                    aria-hidden="true"
                                                    class="w-8 h-8"
                                                >
                                                    <path
                                                        fill-rule="evenodd"
                                                        d="M2 10a8 8 0 1 1 16 0 8 8 0 0 1-16 0Zm5-2.25A.75.75 0 0 1 7.75 7h.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1-.75-.75v-4.5Zm4 0a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1-.75-.75v-4.5Z"
                                                        clip-rule="evenodd"
                                                    />
                                                </svg>
                                            {/if}
                                        </button>

                                        <!-- Indicators -->
                                        <div
                                            class="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-2"
                                        >
                                            {#each quotes as _, index}
                                                <button
                                                    class="w-3 h-3 rounded-full transition-colors"
                                                    class:bg-white={currentQuoteIndex ===
                                                        index}
                                                    class:bg-gray-400={currentQuoteIndex !==
                                                        index}
                                                    onclick={() =>
                                                        (currentQuoteIndex =
                                                            index)}
                                                    aria-label={`Quote ${index + 1}`}
                                                ></button>
                                            {/each}
                                        </div>
                                    </div>
                                </div>
                                <Drawer.Footer
                                    class="flex flex-col items-center bg-[#001140] px-4 py-2 space-y-2"
                                >
                                    <Drawer.Close
                                        class="flex flex-col items-center space-y-2"
                                    >
                                        <Button
                                            href="https://pvhcorp.atlassian.net/wiki/x/fgBFEg"
                                            target="_blank"
                                            data-transaction-name="Learn More button"
                                            rel="noopener noreferrer"
                                            variant="outline"
                                            class="text-black border-white animate-pulse"
                                        >
                                            Learn More
                                        </Button>
                                        <Button
                                            variant="outline"
                                            class="text-black border-white"
                                            data-transaction-name="Close Drawer button"
                                        >
                                            Close
                                        </Button>
                                    </Drawer.Close>
                                </Drawer.Footer>
                            </Drawer.Content>
                        </Drawer.Root>
                    </div>
                </div>
                <!-- Health Check Icon and Text -->
                <a
                    href="/api/health-check"
                    class="ml-4 flex items-center"
                    aria-label="API Health Check"
                    data-transaction-name="API Health Check"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="w-6 h-6 mr-2"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
                        />
                    </svg>
                    <span class="text-sm">API Health Check</span>
                </a>
            </div>
        </div>
    </footer>
</div>