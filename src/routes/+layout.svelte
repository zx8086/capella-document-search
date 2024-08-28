<!-- src/routes/+layout.svelte -->

<script lang="ts">
    import { enhance } from "$app/forms";
    import "../app.css";
    import * as Drawer from "$lib/components/ui/drawer";
    import { Button } from "$lib/components/ui/button";
    import { Toaster } from "$lib/components/ui/sonner";

    import { onMount, setContext, onDestroy } from "svelte";
    import { browser } from "$app/environment";
    import { key, initTracker } from "$lib/context/tracker";
    import type { Options } from "@openreplay/tracker";
    import { frontendConfig } from "../config";
    let tracker: any | null = null;

    async function initializeTracker() {
        if (browser) {
            const TrackerClass = await initTracker();
            if (TrackerClass) {
                tracker = new TrackerClass({
                    projectKey:
                        frontendConfig.openreplay.VITE_OPENREPLAY_PROJECT_KEY,
                    ingestPoint:
                        frontendConfig.openreplay.VITE_OPENREPLAY_INGEST_POINT,
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
        }
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
    let autoplayInterval: number | null = null;

    function nextQuote() {
        currentQuoteIndex = (currentQuoteIndex + 1) % quotes.length;
    }

    function previousQuote() {
        currentQuoteIndex =
            (currentQuoteIndex - 1 + quotes.length) % quotes.length;
    }

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
        // Initialize OpenReplay tracker
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
                console.log("OpenReplay tracker started successfully");
            }
        } catch (error) {
            console.error("Failed to initialize OpenReplay:", error);
        }
    });

    onDestroy(() => {
        if (autoplayInterval) clearInterval(autoplayInterval);
        // if (browser) {
        //     import("$lib/clientInstrumentation").then((module) => {});
        // }
    });
</script>

<div class="flex flex-col min-h-screen">
    <!-- Header Section -->
    <header class="bg-[#00174f] text-white py-4">
        <div class="container mx-auto text-center">
            <h1>Couchbase Capella Document Search</h1>
        </div>
    </header>

    <!-- Main Content -->
    <main class="flex-grow">
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
        <div class="container mx-auto text-center">
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
                            <Drawer.Description class="text-gray-300 text-lg"
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
                                            <p class="text-8xl font-bold mb-4">
                                                "{quote.text}"
                                            </p>
                                        </div>
                                    {/each}
                                </div>

                                <!-- Pause/Play Button -->
                                <button
                                    type="button"
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
                                                (currentQuoteIndex = index)}
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
                                    rel="noopener noreferrer"
                                    variant="outline"
                                    class="text-black border-white animate-pulse"
                                >
                                    Learn More
                                </Button>
                                <Button
                                    variant="outline"
                                    class="text-black border-white"
                                >
                                    Close
                                </Button>
                            </Drawer.Close>
                        </Drawer.Footer>
                    </Drawer.Content>
                </Drawer.Root>.
            </p>
        </div>
    </footer>
</div>
