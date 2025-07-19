<!-- src/routes/api/health-check/+page.svelte -->

<script lang="ts">
    import { client } from '$lib/featureFlags';
    import { onMount } from "svelte";
    import type { PageData } from './$types';
    import { goto } from '$app/navigation';
    import { navigating } from '$app/stores';
    import { writable } from 'svelte/store';
    
    const { data } = $props<{ data: PageData }>();
    
    let healthStatus = $state(data.healthStatus);
    let error = $state("");
    let isSimpleMode = $state(true); // Start with Simple mode by default
    let loading = $state(false);
    let showBuildInfo = $state(false);

    onMount(async () => {
        // Initialize state based on current data without triggering effects
        isSimpleMode = data.checkType === "Simple";
        showBuildInfo = await client.getBooleanValue('build-information', false);
    });

    function toggleHealthMode(): void {
        console.log('BEFORE toggle - isSimpleMode:', isSimpleMode);
        loading = true;
        error = "";
        
        const newType = isSimpleMode ? "Detailed" : "Simple";
        console.log('Navigating to:', newType);
        goto(`/api/health-check?type=${newType}`, {
            replaceState: true,
            noScroll: true
        }).then(() => {
            // Only toggle the state after successful navigation
            isSimpleMode = !isSimpleMode;
            console.log('AFTER navigation - isSimpleMode:', isSimpleMode);
        }).catch((e) => {
            error = e instanceof Error ? e.message : String(e);
            loading = false;
        });
    }

    $effect(() => {
        if (data.healthStatus) {
            healthStatus = data.healthStatus;
            if (data.healthStatus.failedChecks?.length > 0) {
                error = `Some check failed: ${data.healthStatus.failedChecks.join(", ")}`;
            }
            loading = false;
        }
    });

    let transactionName = $derived(
        `API Health Check Page - ${isSimpleMode ? "Simple" : "Detailed"} Check`
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
    <title>Capella Document Search - {isSimpleMode ? "Simple" : "Detailed"} Status</title>
    <meta name="transaction-name" content={transactionName} />
</svelte:head>

<div class="container mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold mb-4">Health Check</h1>

    <div class="mb-6">
        <p class="text-sm text-gray-600 mt-2 mb-4">
            {isSimpleMode
                ? "Simple check tests the SQL Database, Internal API & GraphQL endpoint."
                : "Detailed check covering all dependencies."}
            {#if loading}
                <span class="ml-2 text-blue-600">Loading...</span>
            {/if}
        </p>
        <div class="inline-flex bg-gray-100 rounded-full p-1 shadow-sm border border-gray-200">
            <button
                onclick={() => { 
                    console.log('Simple clicked - isSimpleMode:', isSimpleMode);
                    if (!isSimpleMode) {
                        console.log('Calling toggleHealthMode from Simple');
                        toggleHealthMode(); 
                    } else {
                        console.log('Simple already active, not toggling');
                    }
                }}
                class="px-5 py-2 rounded-full font-medium text-sm transition-all duration-200 {isSimpleMode ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white shadow-md' : 'text-gray-600 hover:text-gray-900'}"
                data-transaction-name="Switch to Simple Check"
                title="Simple health check"
                aria-label="Switch to simple health check"
            >
                Simple
            </button>
            <button
                onclick={() => { 
                    console.log('Detailed clicked - isSimpleMode:', isSimpleMode);
                    if (isSimpleMode) {
                        console.log('Calling toggleHealthMode from Detailed');
                        toggleHealthMode(); 
                    } else {
                        console.log('Detailed already active, not toggling');
                    }
                }}
                class="px-5 py-2 rounded-full font-medium text-sm transition-all duration-200 {!isSimpleMode ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white shadow-md' : 'text-gray-600 hover:text-gray-900'}"
                data-transaction-name="Switch to Detailed Check"
                title="Detailed health check"
                aria-label="Switch to detailed health check"
            >
                Detailed
            </button>
        </div>
    </div>

    {#if loading}
        <div class="flex flex-col items-center justify-center gap-4">
            <p class="text-gray-600">
                Loading {isSimpleMode ? "Simple" : "Detailed"} health check...
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
