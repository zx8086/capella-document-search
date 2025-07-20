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
    let isLoading = $state(false);
    let loadAttempts = $state(0);
    let maxLoadAttempts = 3;

    const videoBasePath = dev ? '/idle-videos/' : 'https://d2bgp0ri487o97.cloudfront.net/';

    function loadVideo(filename: string): string {
        if (!filename) return '';
        const cleanFilename = filename.replace(/^\/+/, '');
        const encodedFilename = encodeURIComponent(cleanFilename);
        return `${videoBasePath}${encodedFilename}`;
    }

    async function handleVideoEnded() {
        console.debug("Video ended, moving to next");
        currentVideoIndex = (currentVideoIndex + 1) % videos.length;
        isPlaying = false;
        await loadAndPlayVideo();
    }

    async function loadAndPlayVideo() {
        if (!videoElement || !videos[currentVideoIndex] || isExiting || isLoading) return;
        
        isLoading = true;
        loadAttempts = 0;
        
        try {
            console.debug(`Attempting to play video ${currentVideoIndex + 1}`);
            currentVideoUrl = loadVideo(videos[currentVideoIndex]);
            isPlaying = false;
            
            // Reset the video element
            videoElement.load();
            
            // Wait for metadata to load with longer timeout and retry logic
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    videoElement.onloadedmetadata = null;
                    videoElement.onerror = null;
                    reject(new Error('Metadata load timeout'));
                }, 10000); // Increased timeout to 10 seconds
                
                videoElement.onloadedmetadata = () => {
                    clearTimeout(timeout);
                    videoElement.onloadedmetadata = null;
                    videoElement.onerror = null;
                    resolve(undefined);
                };
                
                videoElement.onerror = () => {
                    clearTimeout(timeout);
                    videoElement.onloadedmetadata = null;
                    videoElement.onerror = null;
                    reject(new Error('Video load error'));
                };
            });
            
            // Check if component is still mounted
            if (!videoElement || isExiting) {
                isLoading = false;
                return;
            }
            
            // Play the video with user interaction fallback
            try {
                await videoElement.play();
                console.debug("Video started playing");
                isPlaying = true;
                loadAttempts = 0; // Reset attempts on success
            } catch (playError) {
                // Handle power-saving restrictions
                if (playError.name === 'AbortError') {
                    console.warn("Video playback was blocked by power-saving mode");
                    // Add attributes to help bypass restrictions
                    videoElement.setAttribute('autoplay', '');
                    videoElement.setAttribute('loop', '');
                    // Retry with reduced promise
                    const playPromise = videoElement.play();
                    if (playPromise !== undefined) {
                        playPromise.catch(() => {
                            console.warn("Autoplay prevented, waiting for user interaction");
                        });
                    }
                } else {
                    throw playError;
                }
            }
            
            // Preload next video
            const nextIndex = (currentVideoIndex + 1) % videos.length;
            console.debug(`Preloaded video: ${videos[nextIndex]}`);
            
        } catch (error) {
            console.error("Error playing video:", error);
            isPlaying = false;
            loadAttempts++;
            
            // Only try next video if we haven't exceeded attempts
            if (loadAttempts < maxLoadAttempts && videos.length > 1) {
                console.debug(`Trying next video (attempt ${loadAttempts}/${maxLoadAttempts})`);
                currentVideoIndex = (currentVideoIndex + 1) % videos.length;
                // Add small delay before retry
                await new Promise(resolve => setTimeout(resolve, 1000));
                if (!isExiting) {
                    await loadAndPlayVideo();
                }
            } else {
                console.warn("Max load attempts reached or no more videos to try");
                // Reset and try again after longer delay
                setTimeout(() => {
                    if (!isExiting && videos.length > 0) {
                        loadAttempts = 0;
                        currentVideoIndex = 0;
                        loadAndPlayVideo();
                    }
                }, 30000); // Wait 30 seconds before trying again
            }
        } finally {
            isLoading = false;
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
            isExiting = true;
            window.removeEventListener("mousemove", handleUserActivity);
            window.removeEventListener("keydown", handleUserActivity);
            // Stop any playing video
            if (videoElement) {
                videoElement.pause();
                videoElement.src = '';
                videoElement.load();
            }
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
                autoplay
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
