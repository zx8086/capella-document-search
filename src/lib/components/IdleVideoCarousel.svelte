<!-- src/lib/components/IdleVideoCarousel.svelte -->

<script lang="ts">
    import { onMount, onDestroy, createEventDispatcher } from "svelte";
    import { browser } from "$app/environment";
    import { dev } from "$app/environment";
    import VideoPlayerCarousel from "./VideoPlayerCarousel.svelte";

    interface Props {
        videos?: string[];
        idleTime?: number;
    }

    let { videos = [], idleTime = 120000 }: Props = $props();

    // In development, use just one specific video
    // const devVideo = ["X1_Single_Lewis_Hamilton-GENERIC_1280x730.mp4"];
    // const effectiveVideos = dev ? devVideo : videos;

    const dispatch = createEventDispatcher();

    let showVideoCarousel = $state(false);
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    function resetIdleTimer() {
        if (idleTimer) clearTimeout(idleTimer);
        showVideoCarousel = false;
        idleTimer = setTimeout(() => {
            console.debug("Idle time reached, showing video carousel");
            showVideoCarousel = true;
            dispatch("carouselStart");
        }, idleTime);
    }

    function handleUserActivity() {
        if (showVideoCarousel) {
            console.debug("Hiding video carousel due to user activity");
            showVideoCarousel = false;
            dispatch("carouselEnd");
        }
        resetIdleTimer();
    }

    function handleExitFullScreen() {
        console.debug("Exiting full screen");
        showVideoCarousel = false;
        resetIdleTimer();
        dispatch("carouselEnd");
    }

    onMount(() => {
        console.debug("IdleVideoCarousel mounted");
        if (browser) {
            window.addEventListener("mousemove", handleUserActivity);
            window.addEventListener("keydown", handleUserActivity);
            window.addEventListener("click", handleUserActivity);
            window.addEventListener("scroll", handleUserActivity);
        }
        resetIdleTimer();
    });

    onDestroy(() => {
        console.debug("IdleVideoCarousel destroyed");
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
