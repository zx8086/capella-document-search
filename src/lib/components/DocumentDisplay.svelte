<!-- src/lib/components/DocumentDisplay.svelte -->

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

<div
    class="border rounded-md p-4 mt-6 mb-4 w-full relative drop-shadow-lg bg-white"
>
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
        <div class="flex items-center space-x-2">
            <button
                on:click={toggleExpand}
                class="p-1 text-gray-500 hover:text-gray-700"
                aria-label={isExpanded ? "Collapse" : "Expand"}
                data-transaction-name={`${isExpanded ? "Collapse" : "Expand"} Document Display`}
            >
                {#if isExpanded}
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="size-6"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="m4.5 5.25 7.5 7.5 7.5-7.5m-15 6 7.5 7.5 7.5-7.5"
                        />
                    </svg>
                {:else}
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="size-6"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="m5.25 4.5 7.5 7.5-7.5 7.5m6-15 7.5 7.5-7.5 7.5"
                        />
                    </svg>
                {/if}
            </button>
            <h3 class="font-bold">
                <span class="font-semibold text-gray-600">Bucket:</span>
                <span class={hasData ? "text-green-600" : ""}
                    >{bucket || "Unknown"}</span
                >
                <span class="font-semibold text-gray-600 ml-2">Scope:</span>
                <span class={hasData ? "text-green-600" : ""}
                    >{scope || "Unknown"}</span
                >
                <span class="font-semibold text-gray-600 ml-2">Collection:</span
                >
                <span class={hasData ? "text-green-600" : ""}
                    >{collection || "Unknown"}</span
                >
            </h3>
        </div>
        {#if hasData}
            <button
                on:click={downloadJson}
                class="p-2 rounded-full bg-green-100 hover:bg-green-200 transition-colors duration-200"
                title="Download JSON"
                data-transaction-name="Download Document JSON"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="1.5"
                    stroke="currentColor"
                    class="w-6 h-6 text-green-600"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M12 9.75v6.75m0 0-3-3m3 3 3-3m-8.25 6a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
                    />
                </svg>
            </button>
        {/if}
    </div>
    <p class="mt-2">
        Time taken: {timeTaken !== null ? `${timeTaken}ms` : "Unknown"}
    </p>
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
