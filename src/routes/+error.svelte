<script lang="ts">
    import { page } from '$app/stores';
</script>

<div class="flex flex-col items-center justify-center min-h-screen">
    <h1 class="text-2xl font-bold mb-4">
        {$page.status}: {$page.error?.message || 'An error occurred'}
    </h1>
    <a href="/" class="text-blue-500 hover:underline">
        Return to home
    </a>
</div> 