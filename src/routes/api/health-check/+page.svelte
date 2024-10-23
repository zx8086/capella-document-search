<!-- src/routes/api/health-check/+page.svelte -->

<script lang="ts">
    import { onMount } from "svelte";

    let healthStatus: {
        status: string;
        checks: Record<
            string,
            { status: string; message?: string; responseTime?: number }
        >;
        checkType: "Simple" | "Detailed";
    } | null = $state(null);
    let loading = $state(true);
    let error = $state("");
    let checkType: "Simple" | "Detailed" = $state("Simple");

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
        checkType = checkType === "Simple" ? "Detailed" : "Simple";
        fetchHealthCheck();
    }

    onMount(fetchHealthCheck);
    let transactionName = $derived(`API Health Check Page - ${checkType} Check`);
</script>

<svelte:head>
    <title
        >API Health Check - {checkType.charAt(0).toUpperCase() +
            checkType.slice(1)}</title
    >
    <meta name="transaction-name" content={transactionName} />
</svelte:head>

<div class="container mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold mb-4">API Health Check</h1>

    <div class="mb-6">
        <button
            onclick={toggleCheckType}
            class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            data-transaction-name={`Switch to ${checkType === "Simple" ? "Detailed" : "Simple"} Check`}
        >
            Switch to {checkType === "Simple" ? "Detailed" : "Simple"} Check
        </button>
        <p class="text-sm text-gray-600 mt-2">
            {checkType === "Simple"
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
        Back to Home
    </a>
</div>
