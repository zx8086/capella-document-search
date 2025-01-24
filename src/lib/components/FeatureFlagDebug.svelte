<script lang="ts">
    import { useFeatureFlags, flagsStatus } from '$lib/stores/featureFlagStore';
    import { getTracker } from '$lib/context/tracker';
    import { writable } from 'svelte/store';
    
    const { flags } = useFeatureFlags();
    const isVisible = writable(true);
    
    // Access the flags directly from the store
    $: flagEntries = $flags?.flags ? Object.entries($flags.flags) : [];
    
    function checkAllFlags() {
        console.group('🚩 Checking OpenReplay Feature Flags');
        const tracker = getTracker();
        if (tracker) {
            const allFlags = tracker.getAllFeatureFlags();
            console.log('Available flags:', allFlags);
            
            if (allFlags) {
                allFlags.forEach(flag => {
                    if (flag && flag.key) {
                        const isEnabled = $flags.flags[flag.key]?.value;
                        console.log(`${flag.key}: ${isEnabled}`);
                    }
                });
            }
        }
        console.groupEnd();
    }
</script>

{#if $isVisible}
    <div class="fixed top-16 right-4 z-50 w-80 p-3 border rounded-lg shadow-lg bg-white">
        <div class="flex justify-between items-center mb-2">
            <h2 class="text-lg font-bold">Feature Flags Debug</h2>
            <button 
                class="text-gray-500 hover:text-gray-700"
                on:click={() => $isVisible = false}
            >
                ✕
            </button>
        </div>
        
        <div class="mb-3 text-sm space-y-1">
            <p>Status: <span class="font-medium">{$flagsStatus.isInitialized ? 'Initialized' : 'Not Initialized'}</span></p>
            <p>Loading: <span class="font-medium">{$flagsStatus.isLoading ? 'Yes' : 'No'}</span></p>
            {#if $flagsStatus.error}
                <p class="text-red-500">Error: {$flagsStatus.error}</p>
            {/if}
        </div>
        
        <button
            class="w-full bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded text-sm transition-colors"
            on:click={checkAllFlags}
            disabled={!$flagsStatus.isInitialized}
        >
            Check All Flags
        </button>
        
        {#if $flagsStatus.isLoading}
            <div class="mt-3">
                <p class="text-gray-600 text-sm">Loading flags...</p>
            </div>
        {:else if flagEntries.length === 0}
            <div class="mt-3">
                <p class="text-gray-600 text-sm">No flags available</p>
            </div>
        {:else}
            <div class="mt-3 space-y-1">
                {#each flagEntries as [key, flag]}
                    <div class="flex items-center justify-between py-1.5 px-3 bg-gray-50 rounded text-sm">
                        <span class="font-medium">{key}</span>
                        <span class={flag.value ? 'text-green-600' : 'text-red-600'}>
                            {flag.value ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>
                {/each}
            </div>
        {/if}
    </div>
{/if} 