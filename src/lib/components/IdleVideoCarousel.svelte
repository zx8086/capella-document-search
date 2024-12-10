<!-- src/lib/components/IdleVideoCarousel.svelte -->

<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { browser } from "$app/environment";
    import { dev } from "$app/environment";
    import { videoConfig } from "$lib/config/video.config";
    import VideoPlayerCarousel from "./VideoPlayerCarousel.svelte";

    interface Props {
        videos?: string[];
        idleTime?: number;
        onCarouselStart?: () => void;
        onCarouselEnd?: () => void;
    }

    let { 
        videos = [], 
        idleTime = 120000,
        onCarouselStart = () => {},
        onCarouselEnd = () => {}
    }: Props = $props();

    // Use development videos if in dev mode
    const effectiveVideos = dev ? videoConfig.devVideos : videos;

    let showVideoCarousel = $state(false);
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    function resetIdleTimer() {
        if (idleTimer) clearTimeout(idleTimer);
        showVideoCarousel = false;
        idleTimer = setTimeout(() => {
            console.debug("Idle time reached, showing video carousel");
            showVideoCarousel = true;
            onCarouselStart();
        }, idleTime);
    }

    function handleUserActivity() {
        if (showVideoCarousel) {
            console.debug("Hiding video carousel due to user activity");
            showVideoCarousel = false;
            onCarouselEnd();
        }
        resetIdleTimer();
    }

    function handleExitFullScreen() {
        console.debug("Exiting full screen");
        showVideoCarousel = false;
        resetIdleTimer();
        onCarouselEnd();
    }

    onMount(() => {
        if (browser) {
            window.addEventListener("mousemove", handleUserActivity);
            window.addEventListener("keydown", handleUserActivity);
            window.addEventListener("click", handleUserActivity);
            window.addEventListener("scroll", handleUserActivity);
        }
        resetIdleTimer();
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
    videos={effectiveVideos}
    isVisible={showVideoCarousel}
    onExit={handleExitFullScreen}
/>
