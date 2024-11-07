<!-- src/lib/components/VideoPlayerCarousel.svelte -->

<script lang="ts">
    import { run } from "svelte/legacy";

    import { onMount, onDestroy, createEventDispatcher } from "svelte";
    import { browser, dev } from "$app/environment";
    import { fade } from "svelte/transition";
    import { videoConfig } from "$lib/config/video.config";

    interface Props {
        videos?: string[];
        isVisible?: boolean;
    }

    let { videos = [], isVisible = false }: Props = $props();

    const dispatch = createEventDispatcher();

    let videoElement: HTMLVideoElement = $state();
    let currentVideoIndex = $state(0);
    let isExiting = $state(false);
    let isInitialized = $state(false);
    let isPlaying = $state(false);

    const videoBasePath = dev ? '/idle-videos/' : import.meta.env.PUBLIC_VIDEO_BASE_URL;
    const effectiveVideoBasePath =
        videoBasePath.trim() === "" ? "/idle-videos/" : videoBasePath;

    let failedVideos = $state(new Set<string>());

    function getVideoPath(filename: string): string {
        return `${effectiveVideoBasePath}${filename}`;
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

    function loadVideo(filename: string): string {
        if (dev) {
            return `/idle-videos/${filename}`;
        }
        
        return `${videoBasePath}${filename}`;
    }

    let preloadedVideos: { [key: string]: string } = {};
    let preloadIndex = 0;

    async function preloadNextVideo() {
        if (videos.length > 0 && preloadIndex < videos.length) {
            const videoToPreload = videos[preloadIndex];
            if (!preloadedVideos[videoToPreload]) {
                try {
                    const videoUrl = loadVideo(videoToPreload);
                    preloadedVideos[videoToPreload] = videoUrl;
                    console.debug(`Preloaded video: ${videoToPreload}`);
                } catch (error) {
                    console.error(
                        `Error preloading video ${videoToPreload}:`,
                        error,
                    );
                }
            }
            preloadIndex = (preloadIndex + 1) % videos.length;
        }
    }

    // Modify loadAndPlayVideo to use preloaded videos
    async function loadAndPlayVideo() {
        if (videoElement && videos[currentVideoIndex] && !isPlaying) {
            try {
                let videoUrl =
                    preloadedVideos[videos[currentVideoIndex]] ||
                    loadVideo(videos[currentVideoIndex]);
                videoElement.src = videoUrl;
                await playVideo();
                // Preload the next video after starting playback
                preloadNextVideo();
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
        
        const currentVideo = videos[currentVideoIndex];
        failedVideos.add(currentVideo);
        
        currentVideoIndex = (currentVideoIndex + 1) % videos.length;
        
        if (failedVideos.size === videos.length) {
            console.debug("All videos failed to load, stopping carousel");
            dispatch("exit");
            return;
        }
        
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
            preloadNextVideo();
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

    run(() => {
        if (
            isVisible &&
            videos[currentVideoIndex] &&
            isInitialized &&
            !isPlaying
        ) {
            loadAndPlayVideo();
        }
    });
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
                onerror={handleVideoError}
            >
                <source
                    src={loadVideo(videos[currentVideoIndex])}
                    type="video/mp4"
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
