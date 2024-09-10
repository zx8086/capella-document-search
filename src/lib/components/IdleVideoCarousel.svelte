<script lang="ts">
    import { onMount, onDestroy, createEventDispatcher } from "svelte";
    import { browser } from "$app/environment";
    import VideoPlayerCarousel from "./VideoPlayerCarousel.svelte";

    export let videos: string[] = [];
    export let idleTime: number = 10000; // 10 seconds for testing

    const dispatch = createEventDispatcher();

    let showVideoCarousel = false;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    function resetIdleTimer() {
        if (idleTimer) clearTimeout(idleTimer);
        showVideoCarousel = false;
        idleTimer = setTimeout(() => {
            console.log("Idle time reached, showing video carousel");
            showVideoCarousel = true;
            dispatch("carouselStart");
        }, idleTime);
    }

    function handleUserActivity() {
        if (showVideoCarousel) {
            console.log("Hiding video carousel due to user activity");
            showVideoCarousel = false;
            dispatch("carouselEnd");
        }
        resetIdleTimer();
    }

    function handleExitFullScreen() {
        console.log("Exiting full screen");
        showVideoCarousel = false;
        resetIdleTimer();
        dispatch("carouselEnd");
    }

    onMount(() => {
        console.log("IdleVideoCarousel mounted");
        if (browser) {
            window.addEventListener("mousemove", handleUserActivity);
            window.addEventListener("keydown", handleUserActivity);
            window.addEventListener("click", handleUserActivity);
            window.addEventListener("scroll", handleUserActivity);
        }
        resetIdleTimer();
    });

    onDestroy(() => {
        console.log("IdleVideoCarousel destroyed");
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
