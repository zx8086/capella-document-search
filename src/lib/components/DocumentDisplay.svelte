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

<div class="border rounded-md p-4 mb-4 w-full relative drop-shadow-lg bg-white">
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
                class="p-1 text-black-500 hover:text-black-600"
                aria-label="Download Document"
            >
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
                        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
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
