<!-- src/lib/components/FeatureFlagDebug.svelte -->

<script lang="ts">
    import { onMount } from 'svelte';
    import { checkFeatureFlag } from '$lib/featureFlags';
    import { gb } from '$lib/featureFlags'; // Import the gb instance
    
    // Make all state variables reactive using $state
    let isVisible = $state(true);
    let flags = $state<Record<string, boolean>>({});
    let isInitialized = $state(false);
    let isLoading = $state(false);
    let error = $state<string | null>(null);
    
    async function checkAllFlags() {
        console.group('🚩 Checking Feature Flags');
        isLoading = true;
        error = null;
        
        try {
            const results: Record<string, boolean> = {};
            
            // Get all available features
            if (gb) {
                const features = gb.getFeatures();
                for (const [key] of Object.entries(features)) {
                    const value = await checkFeatureFlag(key);
                    results[key] = value;
                    console.log(`${key}: ${value}`);
                }
            }
            
            flags = results;
            isInitialized = true;
        } catch (err) {
            console.error('Error checking flags:', err);
            error = err instanceof Error ? err.message : 'Unknown error';
        } finally {
            isLoading = false;
        }
        console.groupEnd();
    }

    onMount(async () => {
        await checkAllFlags();
        // Set up periodic refresh
        const interval = setInterval(checkAllFlags, 10000);
        return () => clearInterval(interval);
    });
</script>

{#if isVisible}
    <div class="fixed top-16 right-4 z-50 w-80 p-3 border rounded-lg shadow-lg bg-white">
        <div class="flex justify-between items-center mb-2">
            <h2 class="text-lg font-bold">Feature Flags Debug</h2>
            <button 
                class="text-gray-500 hover:text-gray-700"
                onclick={() => isVisible = false}
            >
                ✕
            </button>
        </div>
        
        <div class="mb-3 text-sm space-y-1">
            <p>Status: <span class="font-medium">{isInitialized ? 'Initialized' : 'Not Initialized'}</span></p>
            <p>Loading: <span class="font-medium">{isLoading ? 'Yes' : 'No'}</span></p>
            {#if error}
                <p class="text-red-500">Error: {error}</p>
            {/if}
        </div>
        
        <button
            class="w-full bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded text-sm transition-colors"
            onclick={checkAllFlags}
            disabled={!isInitialized}
        >
            Refresh Flags
        </button>
        
        {#if isLoading}
            <div class="mt-3">
                <p class="text-gray-600 text-sm">Loading flags...</p>
            </div>
        {:else if Object.keys(flags).length === 0}
            <div class="mt-3">
                <p class="text-gray-600 text-sm">No flags available</p>
            </div>
        {:else}
            <div class="mt-3 space-y-1">
                {#each Object.entries(flags) as [key, value]}
                    <div class="flex items-center justify-between py-1.5 px-3 bg-gray-50 rounded text-sm">
                        <span class="font-medium">{key}</span>
                        <span class={value ? 'text-green-600' : 'text-red-600'}>
                            {value ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>
                {/each}
            </div>
        {/if}
    </div>
{/if} 