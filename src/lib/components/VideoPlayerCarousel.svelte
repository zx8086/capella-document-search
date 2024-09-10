<!-- src/lib/components/VideoPlayerCarousel.svelte -->

<script lang="ts">
    import { onMount, onDestroy, createEventDispatcher } from "svelte";
    import { browser } from "$app/environment";
    import { fade } from "svelte/transition";

    export let videos: string[] = [];
    export let isVisible = false;

    const dispatch = createEventDispatcher();

    let videoElement: HTMLVideoElement;
    let currentVideoIndex = 0;
    let isExiting = false;

    function initializeVideo(element: HTMLVideoElement) {
        console.log("Initializing video");
        videoElement = element;
        videoElement.muted = true;
        videoElement.addEventListener("ended", handleVideoEnded);
        videoElement.addEventListener("canplay", handleCanPlay);
        if (isVisible) loadAndPlayVideo();
    }

    function handleVideoEnded() {
        console.log("Video ended, moving to next");
        currentVideoIndex = (currentVideoIndex + 1) % videos.length;
        console.log("New index:", currentVideoIndex);
        loadAndPlayVideo();
    }

    function handleCanPlay() {
        console.log("Video can play");
        if (isVisible) {
            playVideo();
        }
    }

    function loadAndPlayVideo() {
        if (videoElement && videos[currentVideoIndex]) {
            console.log("Loading video:", videos[currentVideoIndex]);
            videoElement.src = videos[currentVideoIndex];
            videoElement.load();
            playVideo();
        }
    }

    function playVideo() {
        if (videoElement) {
            console.log("Attempting to play video");
            videoElement
                .play()
                .then(() => {
                    console.log("Video started playing");
                })
                .catch((error) => {
                    if (error.name !== "AbortError") {
                        console.error("Error playing video:", error);
                    }
                    // Still retry even for AbortError
                    setTimeout(playVideo, 1000);
                });
        }
    }

    function handleUserActivity(event: MouseEvent | KeyboardEvent) {
        event.stopPropagation();
        startFadeOut();
    }

    function startFadeOut() {
        isExiting = true;
        setTimeout(() => {
            dispatch("exit");
        }, 2000);
    }

    onMount(() => {
        console.log("Component mounted, isVisible:", isVisible);
        if (browser && isVisible) {
            window.addEventListener("mousemove", handleUserActivity);
            window.addEventListener("keydown", handleUserActivity);
        }
    });

    onDestroy(() => {
        if (browser) {
            window.removeEventListener("mousemove", handleUserActivity);
            window.removeEventListener("keydown", handleUserActivity);
        }
        if (videoElement) {
            videoElement.removeEventListener("ended", handleVideoEnded);
            videoElement.removeEventListener("canplay", handleCanPlay);
        }
    });

    $: {
        console.log("isVisible changed:", isVisible);
        if (isVisible && videos[currentVideoIndex]) {
            console.log("Attempting to load and play video");
            if (videoElement) {
                loadAndPlayVideo();
            } else {
                setTimeout(loadAndPlayVideo, 0);
            }
        }
    }
</script>

{#if isVisible}
    <div
        class="fixed inset-0 z-50 bg-black flex items-center justify-center"
        transition:fade={{ duration: 2000 }}
    >
        <div
            class="w-full h-full relative"
            data-transaction-name="Video Carousel"
            class:pointer-events-none={isExiting}
        >
            <video
                bind:this={videoElement}
                class="w-full h-full object-cover"
                preload="auto"
                playsinline
                muted
                use:initializeVideo
            >
                <source src={videos[currentVideoIndex]} type="video/mp4" />
                Your browser does not support the video tag.
            </video>
        </div>
    </div>
{/if}

<style>
    :global(.video-js) {
        width: 100% !important;
        height: 100% !important;
    }
    :global(.vjs-tech) {
        object-fit: cover;
    }
    :global(.vjs-control-bar),
    :global(.vjs-big-play-button),
    :global(.vjs-loading-spinner) {
        display: none !important;
    }
    :global(.transition-opacity) {
        transition-property: opacity;
        transition-timing-function: ease-out;
        transition-duration: 2000ms;
    }
</style>
