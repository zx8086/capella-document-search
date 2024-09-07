<!-- src/routes/api/health-check/+page.svelte -->

<script lang="ts">
    import { onMount } from "svelte";

    let healthStatus: {
        status: string;
        checks: Record<string, { status: string; message?: string }>;
        checkType: "simple" | "detailed";
    } | null = null;
    let loading = true;
    let error = "";
    let checkType: "simple" | "detailed" = "simple";

    async function fetchHealthCheck() {
        loading = true;
        error = "";
        try {
            const response = await fetch(`/api/health-check?type=${checkType}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            healthStatus = await response.json();
        } catch (e) {
            console.error("Failed to fetch health check status:", e);
            error = e instanceof Error ? e.message : String(e);
        } finally {
            loading = false;
        }
    }

    function toggleCheckType() {
        checkType = checkType === "simple" ? "detailed" : "simple";
        fetchHealthCheck();
    }

    onMount(fetchHealthCheck);
</script>

<svelte:head>
    <title
        >API Health Check - {checkType.charAt(0).toUpperCase() +
            checkType.slice(1)}</title
    >
</svelte:head>

<div class="container mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold mb-4">API Health Check</h1>

    <div class="mb-6">
        <button
            on:click={toggleCheckType}
            class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
            Switch to {checkType === "simple" ? "Detailed" : "Simple"} Check
        </button>
        <p class="text-sm text-gray-600 mt-2">
            {checkType === "simple"
                ? "Simple check tests the Database and Internal API."
                : "Detailed check includes all checks including the Capella API."}
        </p>
    </div>

    {#if loading}
        <p class="text-gray-600">Loading health check status...</p>
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
