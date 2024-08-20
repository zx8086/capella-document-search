<!-- src/routes/+page.svelte-->

<script lang="ts">
    import type { Options } from "@openreplay/tracker";
    import { enhance } from "$app/forms";
    import { onMount, getContext } from "svelte";
    import { getCollections } from "$lib/collectionManager";
    import { toast } from "svelte-sonner";
    import DocumentDisplay from "$lib/components/DocumentDisplay.svelte";
    import FileUploadResults from "$lib/components/FileUploadResults.svelte";

    import { key } from "$lib/context/tracker";
    import { browser } from "$app/environment";

    const { getTracker } = getContext(key);

    onMount(async () => {
        try {
            if (browser) {
                const tracker = getTracker();
                if (tracker) {
                    tracker.event("Page_View", {
                        page: "Document Search",
                        category: "Navigation",
                        action: "View",
                    });
                }
            }

            allCollections = await getCollections();
            selectedCollections = allCollections.map(
                ({ bucket, scope_name, collection_name }) => ({
                    bucket,
                    scope_name,
                    collection_name,
                }),
            );
        } catch (error) {
            console.error("Error in onMount:", error);
            errorMessage =
                "Failed to fetch collections or initialize tracker. Please try again later.";
        }
    });

    let showDebugInfo = false;
    let debugInfo = "";

    let documentKey = "";
    let searchResults = [];
    let processing = false;
    let errorMessage = "";
    let searchPerformed = false;
    let sortedResults: any[] = [];

    let allCollections: {
        bucket: string;
        scope_name: string;
        collection_name: string;
        tooltip_content: string | null;
    }[] = [];
    let selectedCollections: {
        bucket: string;
        scope_name: string;
        collection_name: string;
    }[] = [];

    let modalIsOpen = false;
    let currentTooltip = "";

    let buttonState = "ready";
    let isSearchMode = true;
    let file: File | null = null;
    let fileUploadResults = [];
    let fileInputFiles: FileList | null = null;

    $: if (fileInputFiles && fileInputFiles.length > 0) {
        file = fileInputFiles[0];
    } else {
        file = null;
    }

    function handleFileChange(event: Event) {
        const target = event.target as HTMLInputElement;
        if (target.files) {
            fileInputFiles = target.files;
            buttonState = "ready";
            fileUploadResults = [];
        }
    }

    function handleSubmit(event) {
        buttonState = "searching";
        processing = true;
        errorMessage = "";
        searchResults = [];
        fileUploadResults = [];
        searchPerformed = true;
        isLoading = true;

        return async ({ result }) => {
            try {
                if (result.type === "success") {
                    const data = result.data;
                    if (isSearchMode) {
                        if (data && data.data && data.data.searchDocuments) {
                            searchResults = data.data.searchDocuments;
                            if (searchResults.length === 0) {
                                toast.error(
                                    "No results found for the given document key.",
                                    {
                                        duration: Infinity,
                                    },
                                );
                            } else {
                                toast.success(
                                    "Search completed successfully.",
                                    {
                                        duration: 3000,
                                    },
                                );
                            }
                        } else {
                            throw new Error(
                                "Unexpected search results structure",
                            );
                        }
                    } else {
                        if (Array.isArray(data)) {
                            fileUploadResults = data;
                            toast.success("File processed successfully.", {
                                duration: 3000,
                            });
                        } else if (data && data.error) {
                            toast.error(data.error, {
                                duration: Infinity,
                            });
                        } else {
                            throw new Error(
                                "Unexpected file upload result structure",
                            );
                        }
                    }
                    buttonState = "results";
                } else if (result.type === "error") {
                    toast.error(result.error || "An unknown error occurred", {
                        duration: Infinity,
                    });
                    buttonState = "ready";
                }
            } catch (e) {
                toast.error(`Error: ${e.message}`, {
                    duration: Infinity,
                });
                buttonState = "ready";
            } finally {
                processing = false;
                isLoading = false;
                if (!isSearchMode) {
                    resetFileInput();
                }
            }
        };
    }

    function resetFileInput() {
        fileInputFiles = null;
        file = null;
        const fileInput = document.getElementById(
            "fileInput",
        ) as HTMLInputElement;
        if (fileInput) {
            fileInput.value = "";
        }
    }

    let fileUploadTooltipContent =
        "Upload a CSV file containing document keys to check in Capella. Each key should be on a separate line or column. No comma is needed after the last document key! The search will be performed across all collections.";

    function openTooltipModal(tooltipContent: string) {
        currentTooltip = tooltipContent;
        modalIsOpen = true;
    }

    $: buttonClass = {
        ready: "cursor-pointer",
        searching: "cursor-not-allowed",
        results: "cursor-not-allowed",
    }[buttonState];

    $: buttonText = {
        ready: isSearchMode ? "Search" : file ? "Search" : "Search",
        searching: isSearchMode ? "Searching..." : "Searching...",
        results: "Done",
    }[buttonState];

    function toggleMode() {
        isSearchMode = !isSearchMode;
        resetForm();
        if (browser) {
            const tracker = getTracker();
            if (tracker) {
                tracker.event("Mode_Change", {
                    newMode: isSearchMode
                        ? "Search Document Key"
                        : "Upload Document Keys",
                    category: "User Interaction",
                    action: "Toggle Mode",
                });
            }
        }
    }

    function resetForm() {
        buttonState = "ready";
        searchResults = [];
        fileUploadResults = [];
        errorMessage = "";
        searchPerformed = false;
        documentKey = "";
        file = null;
    }

    let isLoading = false;

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

    function resetSearch() {
        buttonState = "ready";
        searchResults = [];
        errorMessage = "";
        searchPerformed = false;
    }

    function handleInputClick() {
        if (buttonState === "results") {
            resetSearch();
        }
    }

    $: if (documentKey) {
        resetSearch();
    }

    $: if (documentKey) {
        resetSearch();
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

    $: {
        if (isSearchMode && searchResults.length > 0) {
            sortedResults = [...searchResults].sort((a, b) => {
                const aHasData =
                    a.data !== null && Object.keys(a.data).length > 0;
                const bHasData =
                    b.data !== null && Object.keys(b.data).length > 0;

                if (aHasData && !bHasData) {
                    return -1;
                } else if (!aHasData && bHasData) {
                    return 1;
                } else {
                    return 0;
                }
            });
        } else {
            sortedResults = [];
        }
    }
</script>

<div class="min-h-screen flex flex-col bg-white mb-20 mt-5">
    <!-- Logo Section -->
    <div class="text-center py-4">
        <img src="/favicon.png" alt="PVH" class="mx-auto h-16" />
    </div>

    <!-- Main Content -->
    <div class="flex-grow flex flex-col items-center px-4 mt-4">
        <div class="w-full max-w-6xl">
            <form
                use:enhance={handleSubmit}
                method="POST"
                action={isSearchMode ? "?/searchDocuments" : "?/uploadFile"}
                class="space-y-6"
                enctype="multipart/form-data"
            >
                <!-- Search Bar / File Upload -->
                <div class="w-full flex flex-col items-center mb-4 relative">
                    <div class="w-2/3 max-w-2xl relative">
                        {#if isSearchMode}
                            <!-- Search input -->
                            <div class="relative w-full">
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
                                            />
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
                                    on:click={handleInputClick}
                                    placeholder="Search for a single Document by typing in the key here and click the Search button below..."
                                    class="w-full py-2 pl-10 pr-4 text-sm rounded-md focus:outline-none bg-white border border-gray-300 text-gray-700 focus:ring-2 focus:ring-tommy-red focus:border-tommy-red transition duration-150 ease-in-out"
                                />
                            </div>
                        {:else}
                            <!-- File upload input -->
                            <div class="w-full">
                                <div
                                    class="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 p-8 text-slate-700 dark:border-slate-700 dark:text-slate-300 bg-white min-h-[150px] relative"
                                >
                                    <div
                                        class="flex flex-col items-center justify-center h-full"
                                    >
                                        <label
                                            for="fileInput"
                                            class="cursor-pointer flex flex-col items-center group"
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                viewBox="0 0 24 24"
                                                aria-hidden="true"
                                                fill="currentColor"
                                                class="w-12 h-12 opacity-75 mb-2 group-hover:opacity-100 transition-opacity animate-bounce"
                                            >
                                                <path
                                                    fill-rule="evenodd"
                                                    d="M10.5 3.75a6 6 0 0 0-5.98 6.496A5.25 5.25 0 0 0 6.75 20.25H18a4.5 4.5 0 0 0 2.206-8.423 3.75 3.75 0 0 0-4.133-4.303A6.001 6.001 0 0 0 10.5 3.75Zm2.03 5.47a.75.75 0 0 0-1.06 0l-3 3a.75.75 0 1 0 1.06 1.06l1.72-1.72v4.94a.75.75 0 0 0 1.5 0v-4.94l1.72 1.72a.75.75 0 1 0 1.06-1.06l-3-3Z"
                                                    clip-rule="evenodd"
                                                />
                                            </svg>
                                            <span
                                                class="font-medium text-blue-700 group-hover:underline dark:text-blue-600"
                                            >
                                                Upload
                                            </span>
                                            <input
                                                id="fileInput"
                                                name="file"
                                                type="file"
                                                class="sr-only"
                                                aria-describedby="validFileFormats"
                                                accept=".csv"
                                                on:change={handleFileChange}
                                                bind:files={fileInputFiles}
                                            />
                                        </label>
                                        <span class="mt-1 flex items-center">
                                            a file with Document keys to check
                                            here
                                            <button
                                                on:click|preventDefault={() =>
                                                    openTooltipModal(
                                                        fileUploadTooltipContent,
                                                    )}
                                                class="ml-2 text-gray-500 hover:text-gray-700 focus:outline-none"
                                            >
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                    class="w-4 h-4"
                                                >
                                                    <path
                                                        stroke-linecap="round"
                                                        stroke-linejoin="round"
                                                        stroke-width="2"
                                                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                                    />
                                                </svg>
                                            </button>
                                        </span>
                                        <small
                                            id="validFileFormats"
                                            class="text-xs mt-1"
                                        >
                                            CSV files only (Document Keys Limit:
                                            50)
                                        </small>
                                    </div>

                                    {#if file}
                                        <div
                                            class="absolute bottom-2 left-2 right-2 text-xs bg-white bg-opacity-80 p-1 rounded truncate"
                                        >
                                            Selected file: <span
                                                class="font-semibold text-green-600"
                                                >{file.name}</span
                                            >
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        {/if}
                    </div>

                    <!-- Mode toggle and future icons -->
                    <div
                        class="absolute top-0 right-0 flex items-center space-x-2"
                    >
                        <!-- Add more icons here in the future -->
                        <button
                            type="button"
                            on:click={toggleMode}
                            class="p-2 bg-gray-200 rounded-full hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-tommy-red animate-pulse"
                            title={isSearchMode
                                ? "Switch to Upload Mode"
                                : "Switch to Search Mode"}
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke-width="1.5"
                                stroke="currentColor"
                                class="w-6 h-6"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3"
                                />
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Collections Section -->
                {#if isSearchMode}
                    <div class="mb-4">
                        <div class="flex justify-between items-center mb-2">
                            <h3 class="text-lg font-semibold">
                                Select Data Scopes & Collections:
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
                                            <span
                                                class="text-sm pr-2 flex items-center"
                                            >
                                                {collection.collection_name}
                                                {#if collection.tooltip_content}
                                                    <button
                                                        on:click|preventDefault={() =>
                                                            openTooltipModal(
                                                                collection.tooltip_content,
                                                            )}
                                                        class="ml-2 text-gray-500 hover:text-gray-700 focus:outline-none"
                                                    >
                                                        <svg
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                            class="w-4 h-4"
                                                        >
                                                            <path
                                                                stroke-linecap="round"
                                                                stroke-linejoin="round"
                                                                stroke-width="2"
                                                                d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 0 1 .67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 1 1-.671-1.34l.041-.022ZM12 9a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
                                                            />
                                                        </svg>
                                                    </button>
                                                {/if}
                                            </span>
                                            <div
                                                class="relative inline-flex items-center"
                                            >
                                                <input
                                                    id={`toggle-${collection.bucket}-${collection.scope_name}-${collection.collection_name}`}
                                                    type="checkbox"
                                                    class="peer sr-only"
                                                    role="switch"
                                                    checked={isSelected(
                                                        collection,
                                                    )}
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
                {/if}

                <div class="flex justify-center">
                    <button
                        type="submit"
                        disabled={isSearchMode
                            ? buttonState === "searching" ||
                              buttonState === "results"
                            : buttonState === "searching" ||
                              buttonState === "results" ||
                              !file}
                        class="{buttonClass} w-full sm:w-auto px-6 py-2 min-w-[150px] bg-[#00174f] text-white rounded-md hover:bg-[#00174f]/80 transition duration-150 ease-in-out {(buttonState ===
                            'results' &&
                            isSearchMode) ||
                        (!isSearchMode && (!file || buttonState === 'results'))
                            ? 'opacity-50 cursor-not-allowed'
                            : ''} flex items-center justify-center"
                    >
                        {#if isLoading}
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                                class="size-4 fill-white motion-safe:animate-spin mr-2"
                            >
                                <path
                                    d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z"
                                    opacity=".25"
                                />
                                <path
                                    d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z"
                                />
                            </svg>
                        {/if}
                        {buttonText}
                    </button>
                </div>
            </form>

            <!-- Search Results and Error Messages -->
            {#if errorMessage}
                <p class="text-red-600 mt-4">{errorMessage}</p>
            {/if}

            {#if isSearchMode && searchResults.length > 0}
                <h2 class="mt-4 mb-6">Search Results:</h2>
                {#each sortedResults as result}
                    <DocumentDisplay
                        bucket={result.bucket}
                        scope={result.scope}
                        collection={result.collection}
                        data={result.data}
                        timeTaken={result.timeTaken}
                        {documentKey}
                    />
                {/each}
            {:else if !isSearchMode && fileUploadResults.length > 0}
                <FileUploadResults results={fileUploadResults} />
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

<!-- Tooltip Modal -->
{#if modalIsOpen}
    <div
        class="fixed inset-0 z-30 flex items-center justify-center bg-black/20 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
    >
        <div
            class="max-w-lg flex flex-col gap-4 overflow-hidden rounded-xl border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
            <div
                class="flex items-center justify-between border-b border-slate-300 bg-[#00174f] p-4 dark:border-slate-700 dark:bg-slate-900/20"
            >
                <h3
                    class="font-semibold tracking-wide text-white dark:text-white"
                >
                    Tool Tip
                </h3>
                <button
                    on:click={() => (modalIsOpen = false)}
                    aria-label="close modal"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        stroke="currentColor"
                        fill="none"
                        stroke-width="1.4"
                        class="w-5 h-5"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                </button>
            </div>
            <div class="px-4 py-8">
                <p>{currentTooltip}</p>
            </div>
            <div
                class="flex justify-end border-t border-slate-300 bg-slate-100/60 p-4 dark:border-slate-700 dark:bg-slate-900/20"
            >
                <button
                    on:click={() => (modalIsOpen = false)}
                    type="button"
                    class="cursor-pointer whitespace-nowrap rounded-xl bg-blue-700 px-4 py-2 text-center text-sm font-medium tracking-wide text-slate-100 transition hover:opacity-75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 active:opacity-100 active:outline-offset-0 dark:bg-blue-600 dark:text-slate-100 dark:focus-visible:outline-blue-600"
                >
                    Close
                </button>
            </div>
        </div>
    </div>
{/if}
