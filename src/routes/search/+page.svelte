<!-- src/routes/support/document-search/+page.svelte-->

<script lang="ts">
    import { enhance } from "$app/forms";
    import { page } from "$app/stores";
    import DocumentDisplay from "$lib/components/DocumentDisplay.svelte";
    import { onMount } from "svelte";
    import { getCollections } from "$lib/collectionManager";

    let showDebugInfo = false;
    let debugInfo = "";

    let documentKey = "";
    let searchResults = [];
    let processing = false;
    let errorMessage = "";
    let searchPerformed = false;

    let allCollections: {
        bucket: string;
        scope_name: string;
        collection_name: string;
    }[] = [];
    let selectedCollections: {
        bucket: string;
        scope_name: string;
        collection_name: string;
    }[] = [];

    onMount(async () => {
        try {
            console.log("GETTING COLLECTIONS");
            allCollections = await getCollections();
            selectedCollections = [...allCollections];
        } catch (error) {
            console.error("Error fetching collections:", error);
            errorMessage =
                "Failed to fetch collections. Please try again later.";
        }
    });

    function handleSubmit(event) {
        processing = true;
        errorMessage = "";
        searchResults = [];
        searchPerformed = true;

        return async ({ result }) => {
            console.log("Form submission result:", result);
            if (result.type === "success") {
                try {
                    const data = result.data;
                    console.log("Received data:", data);
                    if (data && data.data && data.data.searchDocuments) {
                        searchResults = data.data.searchDocuments;
                        console.log("Search results:", searchResults);
                    } else {
                        errorMessage = "Unexpected response structure";
                    }
                } catch (e) {
                    console.error("Error processing server response:", e);
                    errorMessage =
                        "Error processing server response: " + e.message;
                }
            } else if (result.type === "error") {
                errorMessage = result.error;
            }
            processing = false;
        };
    }

    function toggleCollection(collection: {
        bucket: string;
        scope_name: string;
        collection_name: string;
    }) {
        const index = selectedCollections.findIndex(
            (c) =>
                c.bucket === collection.bucket &&
                c.scope_name === collection.scope_name &&
                c.collection_name === collection.collection_name,
        );

        if (index !== -1) {
            selectedCollections = selectedCollections.filter(
                (_, i) => i !== index,
            );
        } else {
            selectedCollections = [...selectedCollections, collection];
        }
    }

    function selectAllCollections() {
        selectedCollections = [...allCollections];
    }

    function deselectAllCollections() {
        selectedCollections = [];
    }

    $: isSelected = (collection: {
        bucket: string;
        scope_name: string;
        collection_name: string;
    }) => {
        return selectedCollections.some(
            (c) =>
                c.bucket === collection.bucket &&
                c.scope_name === collection.scope_name &&
                c.collection_name === collection.collection_name,
        );
    };

    function groupCollectionsByScope(collections) {
        return collections.reduce((acc, collection) => {
            if (!acc[collection.scope_name]) {
                acc[collection.scope_name] = [];
            }
            acc[collection.scope_name].push(collection);
            return acc;
        }, {});
    }

    $: groupedCollections = groupCollectionsByScope(allCollections);
</script>

<div class="min-h-screen flex flex-col bg-white">
    <!-- Logo Section -->
    <div class="text-center py-4">
        <img src="/favicon.ico" alt="PVH" class="mx-auto h-16" />
    </div>

    <!-- Main Content -->
    <div class="flex-grow flex flex-col items-center px-4">
        <div class="w-full max-w-6xl">
            <form
                use:enhance={handleSubmit}
                method="POST"
                action="?/searchDocuments"
                class="space-y-6"
            >
                <!-- Search Bar -->
                <fieldset class="w-full mb-4">
                    <div class="relative">
                        <input
                            type="search"
                            id="documentKey"
                            name="documentKey"
                            bind:value={documentKey}
                            on:input={() => {
                                searchPerformed = false;
                            }}
                            placeholder="IMAGE_04_C51_KB0KB09658PMT"
                            class="w-full py-2 px-4 border border-gray-300 rounded-md text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </fieldset>

                <!-- Collections Section -->
                <div class="mb-4">
                    <div class="flex justify-between items-center mb-2">
                        <h3 class="text-lg font-semibold">
                            Select Collections:
                        </h3>
                        <div>
                            <button
                                type="button"
                                on:click={selectAllCollections}
                                class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 mr-2"
                                >Select All</button
                            >
                            <button
                                type="button"
                                on:click={deselectAllCollections}
                                class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                                >Deselect All</button
                            >
                        </div>
                    </div>

                    <div
                        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                    >
                        {#each Object.entries(groupedCollections) as [scope, collections]}
                            <div class="border rounded p-3">
                                <h4 class="font-semibold mb-2">{scope}</h4>
                                {#each collections as collection}
                                    <label
                                        for={`toggle-${collection.bucket}-${collection.scope_name}-${collection.collection_name}`}
                                        class="flex items-center justify-between cursor-pointer mb-2"
                                    >
                                        <span class="text-sm pr-2"
                                            >{collection.collection_name}</span
                                        >
                                        <div
                                            class="relative inline-flex items-center"
                                        >
                                            <input
                                                id={`toggle-${collection.bucket}-${collection.scope_name}-${collection.collection_name}`}
                                                type="checkbox"
                                                class="peer sr-only"
                                                role="switch"
                                                checked={isSelected(collection)}
                                                on:change={() =>
                                                    toggleCollection(
                                                        collection,
                                                    )}
                                            />
                                            <div
                                                class="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"
                                            ></div>
                                        </div>
                                    </label>
                                {/each}
                            </div>
                        {/each}
                    </div>
                </div>

                <input
                    type="hidden"
                    name="collections"
                    value={JSON.stringify(selectedCollections)}
                />

                <button
                    type="submit"
                    disabled={processing}
                    class="w-full py-2 px-4 bg-blue-500 text-white rounded-md cursor-pointer hover:bg-blue-600"
                >
                    {processing ? "Searching..." : "Search"}
                </button>
            </form>

            <!-- Search Results and Error Messages -->
            {#if errorMessage}
                <p class="text-red-600 mt-4">{errorMessage}</p>
            {/if}

            {#if searchResults.length > 0}
                <h2 class="mt-4 mb-2"></h2>
                {#each searchResults as result}
                    <DocumentDisplay
                        bucket={result.bucket}
                        scope={result.scope}
                        collection={result.collection}
                        data={result.data}
                        timeTaken={result.timeTaken}
                        {documentKey}
                    />
                {/each}
            {:else if !processing && documentKey && searchPerformed}
                <p class="mt-4">No results found for the given document key.</p>
            {/if}

            {#if showDebugInfo}
                <div class="mt-4">
                    <h3>Debug Information:</h3>
                    <pre>{JSON.stringify(
                            {
                                processing,
                                errorMessage,
                                searchResults,
                                allCollections,
                                selectedCollections,
                            },
                            null,
                            2,
                        )}</pre>
                </div>
            {/if}
        </div>
    </div>
</div>
