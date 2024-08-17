<!-- DocumentDisplay.svelte -->

<script lang="ts">
    interface DocumentDisplayProps {
        bucket: string | null;
        scope: string | null;
        collection: string | null;
        data: any;
        timeTaken: number | null;
        documentKey: string;
    }

    export let bucket: DocumentDisplayProps["bucket"] = null;
    export let scope: DocumentDisplayProps["scope"] = null;
    export let collection: DocumentDisplayProps["collection"] = null;
    export let data: DocumentDisplayProps["data"] = null;
    export let timeTaken: DocumentDisplayProps["timeTaken"] = null;
    export let documentKey: DocumentDisplayProps["documentKey"] = "";

    let isExpanded = false;

    function toggleExpand() {
        isExpanded = !isExpanded;
    }

    function downloadJson() {
        if (hasData) {
            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = documentKey
                ? `${documentKey}.json`
                : `${bucket}_${scope}_${collection}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    }

    $: hasData = data !== null && Object.keys(data).length > 0;
</script>

<div class="border rounded-md p-4 mb-4 w-full relative">
    {#if hasData}
        <span class="absolute -top-1 -right-1 flex h-3 w-3">
            <span
                class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"
            ></span>
            <span class="relative inline-flex rounded-full h-3 w-3 bg-green-500"
            ></span>
        </span>
    {/if}
    <div class="flex justify-between items-center">
        <h3 class="font-bold cursor-pointer" on:click={toggleExpand}>
            <span class={hasData ? "text-green-600" : ""}>
                {bucket || "Unknown"}.{scope || "Unknown"}.{collection ||
                    "Unknown"}
            </span>
            <span class="ml-2">{isExpanded ? "▼" : "►"}</span>
        </h3>
        {#if hasData}
            <button
                on:click={downloadJson}
                class="px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
                Download
            </button>
        {/if}
    </div>
    <p>Time taken: {timeTaken !== null ? `${timeTaken}ms` : "Unknown"}</p>
    {#if isExpanded}
        <div class="mt-2 max-h-[75vh] overflow-y-auto">
            {#if hasData}
                <pre class="whitespace-pre-wrap">{JSON.stringify(
                        data,
                        null,
                        2,
                    )}</pre>
            {:else}
                <p>No match found in this collection.</p>
            {/if}
        </div>
    {/if}
</div>
