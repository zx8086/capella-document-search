<script lang="ts">
    import { onMount, onDestroy, createEventDispatcher } from "svelte";
    import { browser } from "$app/environment";
    import VideoPlayerCarousel from "./VideoPlayerCarousel.svelte";

    export let videos: string[] = [];
    export let idleTime: number = 120000; // Default to 120 seconds

    const dispatch = createEventDispatcher();

    let showVideoCarousel = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    function resetIdleTimer() {
        if (idleTimer) clearTimeout(idleTimer);
        showVideoCarousel = false;
        idleTimer = setTimeout(() => {
            showVideoCarousel = true;
            dispatch("carouselStart");
        }, idleTime);
    }

    function handleUserActivity() {
        if (showVideoCarousel) {
            showVideoCarousel = false;
            dispatch("carouselEnd");
        }
        resetIdleTimer();
    }

    function handleExitFullScreen() {
        setTimeout(() => {
            showVideoCarousel = false;
            resetIdleTimer();
            dispatch("carouselEnd");
        }, 2000); // This should match the duration in VideoPlayerCarousel
    }

    onMount(() => {
        resetIdleTimer();
        if (browser) {
            window.addEventListener("mousemove", handleUserActivity);
            window.addEventListener("keydown", handleUserActivity);
            window.addEventListener("click", handleUserActivity);
            window.addEventListener("scroll", handleUserActivity);
        }
    });

    onDestroy(() => {
        if (idleTimer) clearTimeout(idleTimer);
        if (browser) {
            window.removeEventListener("mousemove", handleUserActivity);
            window.removeEventListener("keydown", handleUserActivity);
            window.removeEventListener("click", handleUserActivity);
            window.removeEventListener("scroll", handleUserActivity);
        }
    });
</script>

<VideoPlayerCarousel
    {videos}
    isVisible={showVideoCarousel}
    on:exit={handleExitFullScreen}
/>
