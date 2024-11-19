<!-- src/routes/api/health-check/+page.svelte -->

<script lang="ts">
    import { onMount } from "svelte";
    import type { PageData } from './$types';
    import { goto } from '$app/navigation';
    import { navigating } from '$app/stores';
    import { getFeatureFlag, initFeatureFlags } from '$lib/context/tracker';

    const { data } = $props<{ data: PageData }>();

    type HealthStatus = {
        status: string;
        version: {
            build: string;
            commit: string;
            buildDate: string;
        };
        checks: Record<
            string,
            { status: string; message?: string; responseTime?: number }
        >;
        checkType: "Simple" | "Detailed";
    };

    let healthStatus: HealthStatus | null = $state(data.healthStatus);
    let loading = $state(false);
    let error = $state("");
    let checkType: "Simple" | "Detailed" = $state(data.checkType);
    let isNavigating = $state(false);
    let loadingType = $state<"Simple" | "Detailed">(data.checkType);
    let showBuildInfo = $state(false);

    $effect(() => {
        isNavigating = $navigating !== null;
        if (isNavigating) {
            loading = true;
        }
    });

    async function fetchHealthCheck() {
        try {
            loading = true;
            error = "";
            loadingType = checkType; 
            
            await goto(`/api/health-check?type=${checkType}`, {
                invalidateAll: true,
                replaceState: true,
                noScroll: true
            });
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
            loading = false;
        }
    }

    function toggleCheckType() {
        const newType = checkType === "Simple" ? "Detailed" : "Simple";
        loadingType = newType; 
        checkType = newType;
        fetchHealthCheck();
    }


    $effect(() => {
        if (data.healthStatus) {
            healthStatus = data.healthStatus;
            checkType = data.healthStatus.checkType;
            if (!isNavigating) {
                loading = false;
            }
        }
    });

    let transactionName = $derived(
        `API Health Check Page - ${checkType} Check`
    );

    onMount(async () => {
        // Add a small delay to ensure tracker is fully initialized
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        showBuildInfo = await getFeatureFlag('build-information');
        
        console.debug('🏗️ Build Info Display:', {
            isVisible: showBuildInfo,
            flagKey: 'build-information',
            component: 'health-check'
        });
    });

    $effect(() => {
        console.debug('🔄 Build Info Status Changed:', {
            isVisible: showBuildInfo,
            timestamp: new Date().toISOString()
        });
    });
</script>

<svelte:head>
    <title>Capella Document Search - {checkType.charAt(0).toUpperCase() + checkType.slice(1)} Status</title>
    <meta name="transaction-name" content={transactionName} />
</svelte:head>

<div class="container mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold mb-4">Status - API Health Check</h1>

    <div class="mb-6">
        <button
            onclick={toggleCheckType}
            class="bg-[#00174f] hover:bg-[#00174f]/80 text-white font-bold py-2 px-4 rounded"
            data-transaction-name={`Switch to ${checkType === "Simple" ? "Detailed" : "Simple"} Check`}
        >
            Switch to {checkType === "Simple" ? "Detailed" : "Simple"} Check
        </button>
        <p class="text-sm text-gray-600 mt-2">
            {checkType === "Simple"
                ? "Simple check tests the SQL Database, Internal API & GraphQL endpoint."
                : "Detailed check including all API endpoints."}
        </p>
    </div>

    {#if loading}
        <div class="flex flex-col items-center justify-center gap-4">
            <p class="text-gray-600">
                Loading {(checkType === "Simple" ? "detailed" : "simple")} health check...
            </p>
            <div class="animate-spin rounded-full h-12 w-12 border-2 border-gray-200 border-b-gray-900">
                <span class="sr-only">Loading health check status...</span>
            </div>
        </div>
    {:else if error}
        <p class="text-red-600">Error fetching health check: {error}</p>
    {:else if healthStatus}
        <div class="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
            <h2 class="text-xl font-semibold mb-4">
                Overall Status:
                <span
                    class={healthStatus.status === "OK"
                        ? "text-green-600"
                        : "text-red-600"}
                >
                    {healthStatus.status}
                </span>
            </h2>

            {#if showBuildInfo}
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

            <p class="text-md text-gray-700 mb-4">
                Check Type: <span class="font-semibold"
                    >{healthStatus.checkType}</span
                >
            </p>
            <ul class="space-y-4">
                {#each Object.entries(healthStatus.checks) as [service, check]}
                    <li class="border-b pb-2">
                        <span class="font-medium">{service}:</span>
                        <span
                            class={check.status === "OK"
                                ? "text-green-600 ml-2"
                                : "text-red-600 ml-2"}
                        >
                            {check.status}
                        </span>
                        {#if check.responseTime !== undefined}
                            <span class="text-sm text-gray-600 ml-2">
                                (Response time: {check.responseTime}ms)
                            </span>
                        {/if}
                        {#if check.message}
                            <p class="text-sm text-gray-600 mt-1">
                                {check.message}
                            </p>
                        {/if}
                    </li>
                {/each}
            </ul>
        </div>
    {:else}
        <p class="text-red-600">No health check data available.</p>
    {/if}
</div>

<!-- Back to Home link -->
<div class="mt-8 flex justify-center">
    <a
        href="/"
        class="flex items-center text-blue-600 hover:text-blue-800"
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
        Back to Document Search
    </a>
</div>
