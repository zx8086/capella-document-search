<!-- src/routes/api/health-check/+page.svelte -->

<script lang="ts">
    import { featureFlags, flagsStatus, useFeatureFlags } from '$lib/stores/featureFlagStore';
    import { onMount } from "svelte";
    import type { PageData } from './$types';
    import { goto } from '$app/navigation';
    import { navigating } from '$app/stores';
    import { writable } from 'svelte/store';
    
    const { flags, getFlag } = useFeatureFlags();
    const { data } = $props<{ data: PageData }>();
    
    let healthStatus = $state(data.healthStatus);
    let error = $state("");
    let checkType: "Simple" | "Detailed" = $state(data.checkType);
    let loading = $state(false);
    let loadingType = $state(data.checkType);  // Initialize with data.checkType instead
    
    let showBuildInfo = $derived(getFlag('build-information'));

    onMount(() => {
        featureFlags.initialize();
    });

    async function toggleCheckType() {
        try {
            const newType = checkType === "Simple" ? "Detailed" : "Simple";
            loading = true;
            error = "";
            
            // Update checkType immediately for UI feedback
            checkType = newType;
            
            await goto(`/api/health-check?type=${newType}`, {
                replaceState: true,
                noScroll: true
            });
            
        } catch (e) {
            console.error("Health check error details:", e);
            error = e instanceof Error ? e.message : String(e);
            loading = false;
        }
    }

    $effect(() => {
        if (data.healthStatus) {
            healthStatus = data.healthStatus;
            checkType = data.checkType;
            loadingType = data.checkType;  // Update loadingType when data changes
            if (data.healthStatus.failedChecks?.length > 0) {
                error = `Some checks failed: ${data.healthStatus.failedChecks.join(", ")}`;
            }
        }
    });

    $effect(() => {
        loading = Boolean($navigating);
    });

    let transactionName = $derived(
        `API Health Check Page - ${checkType} Check`
    );

    // Add helper function to get status color
    function getStatusColor(status: string): string {
        switch (status) {
            case 'OK':
                return 'text-green-600';
            case 'WARNING':
                return 'text-yellow-600';
            case 'ERROR':
                return 'text-red-600';
            default:
                return 'text-gray-600';
        }
    }

    // Add helper function to get status background
    function getStatusBackground(status: string): string {
        switch (status) {
            case 'OK':
                return 'bg-green-50';
            case 'WARNING':
                return 'bg-yellow-50';
            case 'ERROR':
                return 'bg-red-50';
            default:
                return 'bg-gray-50';
        }
    }
</script>

<svelte:head>
    <title>Capella Document Search - {checkType.charAt(0).toUpperCase() + checkType.slice(1)} Status</title>
    <meta name="transaction-name" content={transactionName} />
</svelte:head>

<div class="container mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold mb-4">Health Check</h1>

    <div class="mb-6">
        <p class="text-sm text-gray-600 mt-2 mb-4">
            {checkType === "Simple"
                ? "Simple check tests the SQL Database, Internal API & GraphQL endpoint."
                : "Detailed check covering all dependencies."}
        </p>
        <button
            onclick={() => toggleCheckType()}
            class="w-48 bg-[#00174f] hover:bg-[#00174f]/80 text-white font-bold py-2 px-4 rounded hover:ring-2 hover:ring-red-500 hover:ring-offset-2 transition-all duration-300"
            data-transaction-name={`Switch to ${checkType === "Simple" ? "Detailed" : "Simple"} Check`}
        >
            Switch to {checkType === "Simple" ? "Detailed" : "Simple"}
        </button>
    </div>

    {#if loading}
        <div class="flex flex-col items-center justify-center gap-4">
            <p class="text-gray-600">
                Loading {checkType === "Simple" ? "Detailed" : "Simple"} health check...
            </p>
            <div class="animate-spin rounded-full h-12 w-12 border-2 border-gray-200 border-b-gray-900">
                <span class="sr-only">Loading health check status...</span>
            </div>
        </div>
    {:else if healthStatus}
        <div class="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
            <!-- Overall Status -->
            <div class={`mb-6 p-4 rounded-lg ${getStatusBackground(healthStatus.status)}`}>
                <h2 class="text-xl font-semibold mb-2">
                    Overall Status:
                    <span class={getStatusColor(healthStatus.status)}>
                        {healthStatus.status}
                    </span>
                </h2>
                {#if healthStatus.failedChecks?.length > 0}
                    <p class="text-red-600 text-sm">
                        Failed checks: {healthStatus.failedChecks.join(', ')}
                    </p>
                {/if}
            </div>

            <!-- Version Information -->
            {#if showBuildInfo && healthStatus.version}
                <div class="bg-gray-100 p-4 rounded-lg mb-4">
                    <h3 class="text-lg font-semibold mb-2">Version Information</h3>
                    <div class="grid grid-cols-2 gap-2 text-sm">
                        <div class="text-gray-600">Build:</div>
                        <div>{healthStatus.version.build}</div>
                        
                        <div class="text-gray-600">Commit:</div>
                        <div class="font-mono">{healthStatus.version.commit}</div>
                        
                        <div class="text-gray-600">Build Date:</div>
                        <div>{new Date(healthStatus.version.buildDate).toLocaleString()}</div>
                    </div>
                </div>
            {/if}

            <!-- Check Type -->
            <p class="text-md text-gray-700 mb-4">
                Check Type: <span class="font-semibold">{healthStatus.checkType}</span>
            </p>

            <!-- Individual Checks -->
            <div class="space-y-4">
                {#each Object.entries(healthStatus.checks).sort(([a], [b]) => a.localeCompare(b)) as [service, check]}
                    <div class={`p-4 rounded-lg ${getStatusBackground(check.status)} border border-${check.status === 'OK' ? 'green' : check.status === 'WARNING' ? 'yellow' : 'red'}-200`}>
                        <div class="flex justify-between items-start">
                            <span class="font-medium">{service}:</span>
                            <span class={getStatusColor(check.status)}>
                                {check.status}
                            </span>
                        </div>
                        {#if check.responseTime !== undefined}
                            <div class="text-sm text-gray-600 mt-1">
                                Response time: {check.responseTime}ms
                            </div>
                        {/if}
                        {#if check.message}
                            <div class={`text-sm mt-1 ${check.status === 'ERROR' ? 'text-red-600' : 'text-gray-600'}`}>
                                {check.message}
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>
    {:else if error}
        <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p class="text-red-600">{error}</p>
        </div>
    {:else}
        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p class="text-yellow-600">No health check data available.</p>
        </div>
    {/if}
</div>

<!-- Back to Home link -->
<div class="mt-8 flex justify-center">
    <a
        href="/"
        class="flex items-center text-blue-600 hover:text-blue-800 hover:ring-2 hover:ring-red-500 hover:ring-offset-2 transition-all duration-300 p-2 rounded-lg"
        data-transaction-name="Back to Home"
    >
        <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            class="w-6 h-6 mr-2"
        >
            <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
            />
        </svg>
        Back to Search
    </a>
</div>
