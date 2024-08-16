<!-- src/routes/support/document-search/+page.svelte-->
<script lang="ts">
    import { enhance } from "$app/forms";
    import { page } from "$app/stores";
    import DocumentDisplay from "$lib/components/DocumentDisplay.svelte";
    import { onMount } from "svelte";
    // import { key } from '$lib/context/tracker';
    import { getCollections } from "$lib/collectionManager";

    // const { getTracker } = getContext(key);
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
</script>

<form
    use:enhance={handleSubmit}
    method="POST"
    action="?/searchDocuments"
    class="max-w-3xl mx-auto"
>
    <fieldset class="w-full space-y-1 text-gray-100 dark:text-gray-800 mb-4">
        <label for="Search" class="hidden">Search</label>
        <div class="relative">
            <span class="absolute inset-y-0 left-0 flex items-center pl-2">
                <button
                    type="button"
                    title="search"
                    class="p-1 focus:outline-none focus:ring"
                >
                    <svg
                        fill="currentColor"
                        viewBox="0 0 512 512"
                        class="w-4 h-4 text-gray-100 dark:text-gray-800"
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
                placeholder="Search..."
                class="w-full py-2 pl-10 text-sm rounded-md sm:w-auto focus:outline-none bg-gray-800 dark:bg-gray-100 text-gray-100 dark:text-gray-800 focus:bg-gray-900 focus:dark:bg-gray-50 focus:border-violet-400 focus:dark:border-violet-600"
            />
        </div>
    </fieldset>

    <div class="mb-4">
        <h3 class="mb-2">Select Collections:</h3>
        <button
            type="button"
            on:click={selectAllCollections}
            class="mr-2 px-2 py-1 bg-blue-500 text-white rounded"
            >Select All</button
        >
        <button
            type="button"
            on:click={deselectAllCollections}
            class="px-2 py-1 bg-blue-500 text-white rounded"
            >Deselect All</button
        >
        {#each allCollections as collection}
            <label class="block">
                <input
                    type="checkbox"
                    checked={isSelected(collection)}
                    on:change={() => toggleCollection(collection)}
                />
                {collection.bucket}.{collection.scope_name}.{collection.collection_name}
            </label>
        {/each}
    </div>

    <input
        type="hidden"
        name="collections"
        value={JSON.stringify(selectedCollections)}
    />

    <button
        type="submit"
        disabled={processing}
        class="w-full py-2 px-4 bg-blue-500 text-white rounded-md cursor-pointer"
    >
        {processing ? "Searching..." : "Search"}
    </button>
</form>

{#if errorMessage}
    <p class="text-red-600 mt-4">{errorMessage}</p>
{/if}

{#if searchResults.length > 0}
    <h2 class="mt-4 mb-2">Search Results:</h2>
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
