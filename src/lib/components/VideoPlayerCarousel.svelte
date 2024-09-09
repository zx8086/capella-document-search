<!-- src/lib/components/VideoPlayerCarousel.svelte -->

<script lang="ts">
    import { onMount, onDestroy, createEventDispatcher } from "svelte";
    import { browser } from "$app/environment";
    import videojs from "video.js";
    import { fade } from "svelte/transition";

    export let videos: string[] = [];
    export let isVisible = false;

    const dispatch = createEventDispatcher();

    // @ts-ignore: Used in template
    let videoElement: HTMLVideoElement;
    let player: any;
    let currentVideoIndex = 0;
    let isExiting = false;

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

            player.on("error", (error: any) => {
                console.error("Video.js error:", error);
            });

            changeVideoSource();
        }
    }

    function changeVideoSource() {
        if (player && videos[currentVideoIndex]) {
            player.src({ type: "video/mp4", src: videos[currentVideoIndex] });
            player.play().catch((error: any) => {
                console.warn("Autoplay was prevented:", error);
            });
        }
    }

    // function exitFullScreen() {
    //     opacity = 0;
    //     setTimeout(() => {
    //         dispatch("exit");
    //     }, 2000); // Wait for 2 seconds before dispatching exit
    // }

    // function fadeOut() {
    //     const fadeInterval = setInterval(() => {
    //         opacity -= 0.05; // Adjust this value to control fade speed
    //         if (opacity <= 0) {
    //             clearInterval(fadeInterval);
    //             dispatch("exit");
    //         }
    //     }, 50); // Adjust this value to control fade smoothness
    // }

    function handleUserActivity(event: MouseEvent | KeyboardEvent) {
        event.stopPropagation();
        startFadeOut();
    }

    function startFadeOut() {
        isExiting = true;
        setTimeout(() => {
            dispatch("exit");
        }, 2000); // Wait for 2 seconds before dispatching exit
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
        isExiting = false; // Reset isExiting when becoming visible
    } else if (!isVisible && browser) {
        window.removeEventListener("mousemove", handleUserActivity);
        window.removeEventListener("keydown", handleUserActivity);
    }

    $: if (player && videos[currentVideoIndex]) {
        changeVideoSource();
    }
</script>

{#if isVisible}
    <div
        class="fixed inset-0 z-50 bg-black flex items-center justify-center"
        transition:fade={{ duration: 2000 }}
    >
        <div
            class="w-full h-full relative"
            data-transaction-name="Video Carouse"
            class:pointer-events-none={isExiting}
        >
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
    :global(.transition-opacity) {
        transition-property: opacity;
        transition-timing-function: ease-out;
        transition-duration: 2000ms;
    }
</style>
