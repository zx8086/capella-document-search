<!-- src/lib/components/VideoPlayerCarousel.svelte -->

<script lang="ts">
    import { onMount, onDestroy, createEventDispatcher } from "svelte";
    import { browser } from "$app/environment";
    import videojs from "video.js";

    export let videos: string[] = []; // URLs of the videos
    export let isVisible = false;

    const dispatch = createEventDispatcher();

    let videoElement: HTMLVideoElement;
    let player: any;
    let currentVideoIndex = 0;

    function initializeVideoJS(element: HTMLVideoElement) {
        if (typeof videojs !== "undefined") {
            player = videojs(element, {
                controls: false,
                autoplay: false,
                muted: true,
                preload: "auto",
                loop: false,
                fluid: true,
                responsive: true,
                controlBar: false,
            });

            player.on("ended", () => {
                currentVideoIndex = (currentVideoIndex + 1) % videos.length;
                changeVideoSource();
            });

            player.on("error", (error) => {
                console.error("Video.js error:", error);
            });

            // Initial play
            changeVideoSource();
        }
    }

    function changeVideoSource() {
        if (player && videos[currentVideoIndex]) {
            player.src({ type: "video/mp4", src: videos[currentVideoIndex] });
            player.play().catch((error) => {
                console.warn("Autoplay was prevented:", error);
            });
        }
    }

    function exitFullScreen() {
        dispatch("exit");
    }

    function handleUserActivity(event: MouseEvent | KeyboardEvent) {
        event.stopPropagation();
        exitFullScreen();
    }

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
        if (player) {
            player.dispose();
        }
    });

    $: if (isVisible && browser) {
        window.addEventListener("mousemove", handleUserActivity);
        window.addEventListener("keydown", handleUserActivity);
    } else if (!isVisible && browser) {
        window.removeEventListener("mousemove", handleUserActivity);
        window.removeEventListener("keydown", handleUserActivity);
    }

    $: if (player && videos[currentVideoIndex]) {
        changeVideoSource();
    }
</script>

{#if isVisible}
    <div class="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div class="w-full h-full relative">
            <video
                bind:this={videoElement}
                class="video-js vjs-default-skin vjs-big-play-centered w-full h-full object-cover"
                preload="auto"
                use:initializeVideoJS
            >
                <source src={videos[currentVideoIndex]} type="video/mp4" />
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
</style>
