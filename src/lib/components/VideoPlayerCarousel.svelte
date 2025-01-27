<!-- src/lib/components/VideoPlayerCarousel.svelte -->

<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { browser, dev } from "$app/environment";
    import { fade } from "svelte/transition";

    interface Props {
        videos?: string[];
        isVisible?: boolean;
        onExit?: () => void;
    }

    let { 
        videos = [], 
        isVisible = false,
        onExit = () => {}
    }: Props = $props();

    let videoElement: HTMLVideoElement = $state();
    let currentVideoIndex = $state(0);
    let isExiting = $state(false);
    let isPlaying = $state(false);
    let currentVideoUrl = $state('');

    const videoBasePath = dev ? '/idle-videos/' : 'https://d2bgp0ri487o97.cloudfront.net/';

    function loadVideo(filename: string): string {
        if (!filename) return '';
        const cleanFilename = filename.replace(/^\/+/, '');
        return `${videoBasePath}${cleanFilename}`;
    }

    async function handleVideoEnded() {
        console.debug("Video ended, moving to next");
        currentVideoIndex = (currentVideoIndex + 1) % videos.length;
        isPlaying = false;
        await loadAndPlayVideo();
    }

    async function loadAndPlayVideo() {
        if (!videoElement || !videos[currentVideoIndex]) return;
        
        try {
            console.debug(`Attempting to play video ${currentVideoIndex + 1}`);
            currentVideoUrl = loadVideo(videos[currentVideoIndex]);
            isPlaying = false;
            
            // Reset the video element
            videoElement.load();
            
            // Wait for metadata to load
            await new Promise((resolve) => {
                videoElement.onloadedmetadata = resolve;
            });
            
            // Play the video
            await videoElement.play();
            console.debug("Video started playing");
            isPlaying = true;
            
            // Preload next video
            const nextIndex = (currentVideoIndex + 1) % videos.length;
            console.debug(`Preloaded video: ${videos[nextIndex]}`);
        } catch (error) {
            console.error("Error playing video:", error);
            isPlaying = false;
            // Try next video if current one fails
            currentVideoIndex = (currentVideoIndex + 1) % videos.length;
            await loadAndPlayVideo();
        }
    }

    function handleUserActivity(event: MouseEvent | KeyboardEvent) {
        if (!isExiting) {
            event.stopPropagation();
            isExiting = true;
            onExit();
        }
    }

    $effect(() => {
        if (isVisible && videos.length > 0 && !isPlaying) {
            loadAndPlayVideo();
        }
    });

    onMount(() => {
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
    });
</script>

{#if isVisible}
    <div
        class="fixed inset-0 z-50 bg-black flex items-center justify-center"
        transition:fade={{ duration: 2000 }}
        data-openreplay-hidden
    >
        <div
            class="w-full h-full relative"
            data-transaction-name="Video Carousel"
            class:pointer-events-none={isExiting}
            data-openreplay-hidden
        >
            <video
                bind:this={videoElement}
                class="w-full h-full object-cover"
                preload="auto"
                playsinline
                muted
                onended={handleVideoEnded}
                data-openreplay-hidden
            >
                <source src={currentVideoUrl} type="video/mp4" />
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
