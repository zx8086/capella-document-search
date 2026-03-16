<!-- src/lib/components/VideoPlayerCarousel.svelte -->

<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { fade } from "svelte/transition";
import { browser, dev } from "$app/environment";

interface Props {
  videos?: string[];
  isVisible?: boolean;
  onExit?: () => void;
}

let { videos = [], isVisible = false, onExit = () => {} }: Props = $props();

let videoElement: HTMLVideoElement = $state();
let currentVideoIndex = $state(0);
let isExiting = $state(false);
let isPlaying = $state(false);
let _currentVideoUrl = $state("");
let isLoading = $state(false);
let loadAttempts = $state(0);
let maxLoadAttempts = 3;

const videoBasePath = dev ? "/idle-videos/" : "https://d2bgp0ri487o97.cloudfront.net/";

function loadVideo(filename: string): string {
  if (!filename) return "";
  const cleanFilename = filename.replace(/^\/+/, "");
  const encodedFilename = encodeURIComponent(cleanFilename);
  return `${videoBasePath}${encodedFilename}`;
}

async function _handleVideoEnded() {
  currentVideoIndex = (currentVideoIndex + 1) % videos.length;
  isPlaying = false;
  await loadAndPlayVideo();
}

async function loadAndPlayVideo() {
  if (!videoElement || !videos[currentVideoIndex] || isExiting || isLoading) return;

  isLoading = true;
  loadAttempts = 0;

  try {
    _currentVideoUrl = loadVideo(videos[currentVideoIndex]);
    isPlaying = false;

    // Reset the video element
    videoElement.load();

    // Wait for metadata to load with timeout and retry logic
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (videoElement) {
          videoElement.onloadedmetadata = null;
          videoElement.onerror = null;
        }
        reject(new Error("Metadata load timeout"));
      }, 10000);

      videoElement.onloadedmetadata = () => {
        clearTimeout(timeout);
        if (videoElement) {
          videoElement.onloadedmetadata = null;
          videoElement.onerror = null;
        }
        resolve(undefined);
      };

      videoElement.onerror = () => {
        clearTimeout(timeout);
        if (videoElement) {
          videoElement.onloadedmetadata = null;
          videoElement.onerror = null;
        }
        reject(new Error("Video load error"));
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
      isPlaying = true;
      loadAttempts = 0;
    } catch (playError) {
      // Autoplay blocked by browser power-saving or policy -- mark as playing
      // to prevent the $effect from re-triggering an infinite retry loop
      isPlaying = true;
      videoElement.setAttribute("autoplay", "");
      videoElement.setAttribute("loop", "");
      videoElement.play().catch(() => {});
    }

  } catch (error) {
    console.error("Error playing video:", error);
    isPlaying = false;
    loadAttempts++;

    // Only try next video if we haven't exceeded attempts
    if (loadAttempts < maxLoadAttempts && videos.length > 1) {
      currentVideoIndex = (currentVideoIndex + 1) % videos.length;
      // Add small delay before retry
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (!isExiting) {
        await loadAndPlayVideo();
      }
    } else {
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
      videoElement.src = "";
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
                onended={_handleVideoEnded}
                data-openreplay-hidden
            >
                <source src={_currentVideoUrl} type="video/mp4" />
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
