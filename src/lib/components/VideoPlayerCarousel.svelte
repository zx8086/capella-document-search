<!-- src/lib/components/VideoPlayerCarousel.svelte -->

<script lang="ts">
    import { onMount, onDestroy, createEventDispatcher } from "svelte";
    import { browser } from "$app/environment";
    import { fade } from "svelte/transition";
    import frontendConfig from "$frontendConfig";

    export let videos: string[] = [];
    export let isVisible = false;

    const dispatch = createEventDispatcher();

    let videoElement: HTMLVideoElement;
    let currentVideoIndex = 0;
    let isExiting = false;
    let isInitialized = false;
    let isPlaying = false;

    const videoBasePath = "/idle-videos/";
    const effectiveVideoBasePath =
        videoBasePath.trim() === "" ? "/idle-videos/" : videoBasePath;

    function getVideoPath(filename: string, format?: string): string {
        return `${effectiveVideoBasePath}${filename}${format ? `.${format}` : ""}`;
    }

    function initializeVideo(element: HTMLVideoElement) {
        if (!isInitialized) {
            console.debug("Initializing video");
            videoElement = element;
            videoElement.muted = true;
            videoElement.addEventListener("ended", handleVideoEnded);
            isInitialized = true;
        }
    }

    function handleVideoEnded() {
        console.debug("Video ended, moving to next");
        currentVideoIndex = (currentVideoIndex + 1) % videos.length;
        console.debug("New index:", currentVideoIndex);
        isPlaying = false;
        loadAndPlayVideo();
    }

    async function loadVideo(filename: string) {
        const response = await fetch(`${videoBasePath}${filename}`);
        if (!response.ok) throw new Error("Video load failed");
        return URL.createObjectURL(await response.blob());
    }

    async function loadAndPlayVideo() {
        if (videoElement && videos[currentVideoIndex] && !isPlaying) {
            try {
                const videoUrl = await loadVideo(videos[currentVideoIndex]);
                videoElement.src = videoUrl;
                await playVideo();
            } catch (error) {
                console.error("Error loading video:", error);
            }
        }
    }

    function playVideo() {
        if (videoElement && !isPlaying) {
            console.debug("Attempting to play video");
            isPlaying = true;
            videoElement
                .play()
                .then(() => {
                    console.debug("Video started playing");
                    isPlaying = true;
                })
                .catch((error) => {
                    if (error.name !== "AbortError") {
                        console.error("Error playing video:", error);
                    }
                    isPlaying = false;
                    setTimeout(playVideo, 1000);
                });
        }
    }

    function handleUserActivity(event: MouseEvent | KeyboardEvent) {
        event.stopPropagation();
        startFadeOut();
    }

    function handleVideoError(error: Event): void {
        console.error("Video playback error:", error);
        // Attempt to load the next video or show a fallback image
        currentVideoIndex = (currentVideoIndex + 1) % videos.length;
        loadAndPlayVideo();
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
        }
    });

    $: if (
        isVisible &&
        videos[currentVideoIndex] &&
        isInitialized &&
        !isPlaying
    ) {
        loadAndPlayVideo();
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
                on:error={handleVideoError}
            >
                <source
                    src={getVideoPath(videos[currentVideoIndex], "mp4")}
                    type="video/mp4"
                />
                <source
                    src={getVideoPath(videos[currentVideoIndex], "webm")}
                    type="video/webm"
                />
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
