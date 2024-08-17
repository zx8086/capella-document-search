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
                <div class="w-full flex justify-center mb-4">
                    <fieldset class="w-2/3 max-w-2xl">
                        <label for="documentKey" class="hidden">Search</label>
                        <div class="relative">
                            <span
                                class="absolute inset-y-0 left-0 flex items-center pl-3"
                            >
                                <button
                                    type="button"
                                    title="search"
                                    class="p-1 focus:outline-none focus:ring focus:ring-tommy-red/50 rounded-full"
                                >
                                    <svg
                                        fill="currentColor"
                                        viewBox="0 0 512 512"
                                        class="w-4 h-4 text-gray-500"
                                    >
                                        <path
                                            d="M479.6,399.716l-81.084-81.084-62.368-25.767A175.014,175.014,0,0,0,368,192c0-97.047-78.953-176-176-176S16,94.953,16,192,94.953,368,192,368a175.034,175.034,0,0,0,101.619-32.377l25.7,62.2L400.4,478.911a56,56,0,1,0,79.2-79.195ZM48,192c0-79.4,64.6-144,144-144s144,64.6,144,144S271.4,336,192,336,48,271.4,48,192ZM456.971,456.284a24.028,24.028,0,0,1-33.942,0l-76.572-76.572-23.894-57.835L380.4,345.771l76.573,76.572A24.028,24.028,0,0,1,456.971,456.284Z"
                                        ></path>
                                    </svg>
                                </button>
                            </span>
                            <input
                                type="search"
                                id="documentKey"
                                name="documentKey"
                                bind:value={documentKey}
                                on:input={() => {
                                    searchPerformed = false;
                                }}
                                placeholder="Search for a single Document by typing in the key here..."
                                class="w-full py-2 pl-10 pr-4 text-sm rounded-md focus:outline-none bg-white border border-gray-300 text-gray-700 focus:ring-2 focus:ring-tommy-red focus:border-tommy-red transition duration-150 ease-in-out"
                            />
                        </div>
                    </fieldset>
                </div>

                <!-- Collections Section -->
                <div class="mb-4">
                    <div class="flex justify-between items-center mb-2">
                        <h3 class="text-lg font-semibold">
                            Select Data Collections:
                        </h3>
                        <div>
                            <button
                                type="button"
                                on:click={selectAllCollections}
                                class="px-3 py-1 bg-[#00174f] text-white rounded hover:bg-[#00174f]/80 mr-2"
                                >Select All</button
                            >
                            <button
                                type="button"
                                on:click={deselectAllCollections}
                                class="px-3 py-1 bg-[#00174f] text-white rounded hover:bg-[#00174f]/80"
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
                                                class="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-[#551a8b]/50 dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-light-blue"
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

                <div class="flex justify-center">
                    <button
                        type="submit"
                        disabled={processing}
                        class="w-full sm:w-auto px-6 py-2 min-w-[150px] bg-[#00174f] text-white rounded-md cursor-pointer hover:bg-[#00174f]/80 transition duration-150 ease-in-out"
                    >
                        {processing ? "Searching..." : "Search"}
                    </button>
                </div>
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
