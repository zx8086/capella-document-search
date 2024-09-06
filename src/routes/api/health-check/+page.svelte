<!-- src/routes/api/health-check/+page.svelte -->

<script lang="ts">
    import { onMount } from "svelte";

    let healthStatus: {
        status: string;
        checks: Record<string, { status: string; message?: string }>;
    } | null = null;
    let loading = true;
    let error = "";

    onMount(async () => {
        try {
            const response = await fetch("/api/health-check");
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
    });
</script>

<svelte:head>
    <title>API Health Check</title>
</svelte:head>

<h1>API Health Check</h1>

{#if loading}
    <p>Loading health check status...</p>
{:else if error}
    <p class="error-message">Error fetching health check: {error}</p>
{:else if healthStatus}
    <h2>
        Overall Status: <span
            class={healthStatus.status === "OK" ? "status-ok" : "status-error"}
            >{healthStatus.status}</span
        >
    </h2>
    <ul>
        {#each Object.entries(healthStatus.checks) as [service, check]}
            <li>
                {service}:
                <span
                    class={check.status === "OK" ? "status-ok" : "status-error"}
                    >{check.status}</span
                >
                {#if check.message}
                    <br />
                    <small class="error-message">{check.message}</small>
                {/if}
            </li>
        {/each}
    </ul>
{:else}
    <p class="error-message">No health check data available.</p>
{/if}

<style>
    h1,
    h2 {
        color: #333;
    }
    ul {
        list-style-type: none;
        padding: 0;
    }
    li {
        margin-bottom: 15px;
        font-size: 16px;
    }
    .status-ok {
        color: green;
        font-weight: bold;
    }
    .status-error {
        color: red;
        font-weight: bold;
    }
    .error-message {
        color: #d32f2f;
        font-size: 14px;
    }
</style>
