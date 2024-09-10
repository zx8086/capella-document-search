<!-- src/routes/+layout.svelte -->

<script lang="ts">
    import "../app.css";
    import * as Drawer from "$lib/components/ui/drawer";
    import { Button } from "$lib/components/ui/button";
    import { Toaster } from "$lib/components/ui/sonner";
    import { onMount, setContext, onDestroy } from "svelte";
    import { browser } from "$app/environment";
    import { key, initTracker } from "$lib/context/tracker";
    import type { Options } from "@openreplay/tracker";
    import { frontendConfig } from "$frontendConfig";
    import { writable } from "svelte/store";
    // import videojs from "video.js";
    // import VideoPlayerCarousel from "$lib/components/VideoPlayerCarousel.svelte";
    import { collections } from "../stores/collectionsStore";

    let pollInterval: number;

    let tracker: any | null = null;
    let isTrackerInitialized = false;

    // let showVideoCarousel = false;
    // let idleTimer: ReturnType<typeof setTimeout> | null = null;

    // function resetIdleTimer() {
    //     if (idleTimer) clearTimeout(idleTimer);
    //     showVideoCarousel = false;
    //     idleTimer = setTimeout(() => {
    //         showVideoCarousel = true;
    //     }, 120000); // 120 seconds for production
    // }

    // function handleUserActivity() {
    //     if (showVideoCarousel) {
    //         showVideoCarousel = false;
    //     }
    //     resetIdleTimer();
    // }

    // function handleExitFullScreen() {
    //     setTimeout(() => {
    //         showVideoCarousel = false;
    //         resetIdleTimer();
    //     }, 2000); // This should match the duration in VideoPlayerCarousel
    // }

    const darkMode = writable(false);

    // function toggleDarkMode() {
    //     darkMode.update((value) => {
    //         const newValue = !value;
    //         if (browser) {
    //             localStorage.setItem("theme", newValue ? "dark" : "light");
    //         }
    //         return newValue;
    //     });
    // }

    function applyDarkMode(isDark: boolean) {
        if (browser) {
            if (isDark) {
                document.documentElement.classList.add("dark");
            } else {
                document.documentElement.classList.remove("dark");
            }
        }
    }

    $: if (browser) {
        applyDarkMode($darkMode);
    }

    async function initializeTracker() {
        if (isTrackerInitialized) return tracker;
        if (browser) {
            try {
                const TrackerClass = await initTracker();
                if (TrackerClass) {
                    tracker = new TrackerClass({
                        projectKey:
                            frontendConfig.openreplay
                                .VITE_OPENREPLAY_PROJECT_KEY,
                        ingestPoint:
                            frontendConfig.openreplay
                                .VITE_OPENREPLAY_INGEST_POINT,
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
                        verbose: true,
                        console: {
                            enabled: true,
                            level: ["log", "info", "warn", "error"],
                        },
                    } as Options);
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

    let currentQuoteIndex = 0;
    let isPaused = false;
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
        // resetIdleTimer();
        // if (browser) {
        //     window.addEventListener("mousemove", handleUserActivity);
        //     window.addEventListener("keydown", handleUserActivity);
        //     window.addEventListener("click", handleUserActivity);
        //     window.addEventListener("scroll", handleUserActivity);
        // }
        startAutoplay();
        // if (browser) {
        //     const savedTheme = localStorage.getItem("theme");
        //     const prefersDark = window.matchMedia(
        //         "(prefers-color-scheme: dark)",
        //     ).matches;
        //     const isDark =
        //         savedTheme === "dark" || (!savedTheme && prefersDark);
        //     darkMode.set(isDark);
        //     applyDarkMode(isDark);
        // }

        try {
            const trackerInstance = await initializeTracker();
            if (trackerInstance) {
                await trackerInstance.start({
                    userID: "simon.owusu@tommy.com",
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

        // Add the following lines for collection polling
        collections.fetchCollections(); // Initial fetch
        pollInterval = setInterval(
            () => {
                collections.fetchCollections();
            },
            60 * 60 * 1000,
        ); // Poll every 60 minutes
    });

    onDestroy(() => {
        // if (idleTimer) clearTimeout(idleTimer);
        // if (browser) {
        //     window.removeEventListener("mousemove", handleUserActivity);
        //     window.removeEventListener("keydown", handleUserActivity);
        //     window.removeEventListener("click", handleUserActivity);
        //     window.removeEventListener("scroll", handleUserActivity);
        // }
        if (autoplayInterval) clearInterval(autoplayInterval);

        // Add this line to clear the polling interval
        if (pollInterval) clearInterval(pollInterval);
    });

    // const videos = [
    //     "/idle-videos/X1_Single_Lewis_Hamilton-GENERIC_1280x730.mp4",
    //     "/idle-videos/FA24_TH_T1_OCTOBER_DUO_10_B_ PAID_ LOGO_SOUND_1920_1080.mp4",
    //     "/idle-videos/ECOM_TOMMY_STRAY_KIDS_6sec_001_3412x1892_MP4_Audio_NoLogo.mp4",
    //     "/idle-videos/FA24_TH_T1_SEPTEMBER_ABBEY_6_C_ECOM_ NO LOGO_SOUND_3412_1892.mp4",
    //     "/idle-videos/X1_DUO_GR_LH-GENERIC_1280x730.mp4",
    //     "/idle-videos/ECOM_TOMMY_STRAY_KIDS_6sec_002_3412x1892_MP4_Audio_NoLogo.mp4",
    //     "/idle-videos/FA24_TH_T1_OCTOBER_DUO_6_A_ECOM_ NO LOGO_SOUND_3412_1892.mp4",
    //     "/idle-videos/ECOM_TOMMY_STRAY_KIDS_6sec_003_3412x1892_MP4_Audio_NoLogo.mp4",
    //     "/idle-videos/FA24_TH_T1_SEPTEMBER_PATRIC_6_B_ECOM_ NO LOGO_SOUND_3412_1892.mp4",
    // ];
</script>

<!-- <VideoPlayerCarousel
    {videos}
    isVisible={showVideoCarousel}
    on:exit={handleExitFullScreen}
/> -->

<div class="flex flex-col min-h-screen">
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

                <!-- Right column (dark mode toggle) -->
                <div class="w-1/4 flex justify-end items-center space-x-2">
                    <!-- <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="size-6 text-white"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
                        />
                    </svg>
                    <button
                        data-transaction-name="Toggle Dark Mode"
                        on:click={toggleDarkMode}
                        class="w-14 h-8 rounded-full bg-gray-300 flex items-center transition duration-300 focus:outline-none shadow"
                    >
                        <div
                            class:translate-x-6={$darkMode}
                            class="w-6 h-6 relative rounded-full transition duration-500 transform bg-white shadow-md"
                        ></div>
                    </button>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="size-6 text-white"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"
                        />
                    </svg> -->
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
        <slot />
    </main>

    <!-- Footer Section -->
    <footer class="bg-[#00174f] text-white py-4 mt-8">
        <div class="container mx-auto px-4">
            <div class="flex justify-between items-center">
                <!-- Copyright and B2B Platform Engineering -->
                <div class="flex-grow text-center">
                    <p>
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
                                            on:click={togglePause}
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
                                                    on:click={() =>
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
                    </p>
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
