<!-- src/routes/+page.svelte-->

<script lang="ts">
import Papa from "papaparse";
import { getContext, onMount } from "svelte";
import { toast } from "svelte-sonner";
import { browser } from "$app/environment";
import { pushState, replaceState } from "$app/navigation";
import { page } from "$app/state";
import { frontendConfig } from "$frontendConfig";
import { debugTrackerStatus, key, trackEvent } from "$lib/context/tracker";
import { authStore } from "$lib/stores/auth.svelte";
import type { Collection } from "../models";
import { collections } from "$lib/stores/collections.svelte";
import { videos } from "../stores/videoStore";
import { enhance } from "$app/forms";
import DocumentDisplay from "$lib/components/DocumentDisplay.svelte";
import FileUploadResults from "$lib/components/FileUploadResults.svelte";
import IdleVideoCarousel from "$lib/components/IdleVideoCarousel.svelte";
import FeatureFlagDebug from "$lib/components/FeatureFlagDebug.svelte";

interface SearchResult {
  collection: string;
  data: any;
}

const { getTracker } = getContext(key) as {
  getTracker: typeof import("$lib/context/tracker").getTracker;
};

let currentUser = $state({
  id: "",
  email: "",
  name: "",
});

function trackClick(elementName: string, action: string) {
  if (browser) {
    trackEvent("User_Interaction", {
      type: "click",
      element: elementName,
      action: action,
      page: "Document Search",
      userId: currentUser.name,
      metadata: {
        isSearchMode,
        buttonState,
      },
    });
  }
}

let allCollections: Collection[] = $state([]);
let selectedCollections: Collection[] = $state([]);
let _errorMessage: string = $state("");
let _errorDetails: string = "";

// Sync collections from the runes-based store - use $effect.pre to avoid loops
$effect.pre(() => {
  const fetchedCollections = collections.items;

  // Only update if we have collections and they differ from current
  if (fetchedCollections.length === 0) return;
  if (allCollections.length === fetchedCollections.length) return;

  // Sort the fetched collections
  const sorted = [...fetchedCollections].sort((a, b) => {
    if (a.scope_name < b.scope_name) return -1;
    if (a.scope_name > b.scope_name) return 1;
    if (a.collection_name < b.collection_name) return -1;
    if (a.collection_name > b.collection_name) return 1;
    return 0;
  });

  allCollections = sorted;
  selectedCollections = sorted.map(({ bucket, scope_name, collection_name }) => ({
    bucket,
    scope_name,
    collection_name,
  }));
});

// Sync userAccount from auth store - use $effect.pre to avoid infinite loops
$effect.pre(() => {
  const account = authStore.userAccount;
  if (account) {
    const newUser = {
      id: account.localAccountId || account.homeAccountId || "",
      email: account.username || "",
      name: account.name || "",
    };
    // Only update if values actually changed to prevent loops
    if (
      currentUser.id !== newUser.id ||
      currentUser.email !== newUser.email ||
      currentUser.name !== newUser.name
    ) {
      currentUser = newUser;
    }
  }
});

onMount(() => {

  if (browser) {
    const tracker = getTracker();
    if (tracker) {
      trackEvent("Page_View", {
        page: "Document Search",
        category: "Navigation",
        action: "View",
        userId: currentUser.name,
      });
    }
  }

  // Initialize the store with data from the server
  const pageData = page.data;
  if (pageData?.collections) {
    collections.set(pageData.collections);
  }

  if (browser) {
    debugTrackerStatus();
  }
});

let _showDebugInfo: boolean = false;
// let debugInfo = "";

let documentKey: string = $state("");
let _processing = $state(false);
let _searchPerformed = $state(false);
let _sortedResults: any[] = $state([]);

let searchResults: SearchResult[] = $state([]);

let _currentTooltip = $state("");
let modalIsOpen = $derived(Boolean(page.state.modalIsOpen));

let buttonState = $state("ready");
let isSearchMode = $state(true);
let file: File | null = $state(null);
let _fileUploadResults = $state([]);
let fileInputFiles: FileList | null = $state(null);

$effect(() => {
  if (fileInputFiles && fileInputFiles.length > 0) {
    file = fileInputFiles[0];
  } else {
    file = null;
  }
});

let isFileValid: boolean = $state(false);
let _showExampleModal: boolean = $state(false);

function _handleFileChange(event: Event): void {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    file = target.files[0];
    validateCSVFile(file);
    _fileUploadResults = [];
    searchResults = [];
  } else {
    file = null;
    isFileValid = false;
  }
}

function validateCSVFile(file: File): void {
  Papa.parse(file, {
    complete: (results) => {
      if (results.data && results.data.length > 0) {
        let documentKeys: string[] = [];

        documentKeys = results.data.flatMap((row) => {
          if (Array.isArray(row)) {
            return row.map((item) => item.trim()).filter((item) => item !== "");
          } else if (typeof row === "string") {
            return row
              .split(",")
              .map((item) => item.trim())
              .filter((item) => item !== "");
          }
          return [];
        });

        const isValidFormat = documentKeys.every((key) => {
          return /^[A-Z]+_\d+_.+$/.test(key) && !/^["']|["']$/.test(key);
        });

        if (!isValidFormat) {
          isFileValid = false;
          buttonState = "ready";
          toast.error(
            "Invalid file format. Some document keys do not follow the required format. Please check the example and try again.",
            { duration: Infinity }
          );
          _showExampleModal = true;
          return;
        }

        if (documentKeys.length === 0) {
          isFileValid = false;
          buttonState = "ready";
          toast.error(
            "Invalid file format. The file contains no valid document keys. Please check the example and try again.",
            { duration: Infinity }
          );
          _showExampleModal = true;
        } else if (documentKeys.length > frontendConfig.csv.FILE_UPLOAD_LIMIT) {
          isFileValid = false;
          buttonState = "ready";
          toast.error(
            `Too many document keys. The file contains ${documentKeys.length} keys, but the maximum allowed is ${frontendConfig.csv.FILE_UPLOAD_LIMIT}.`,
            { duration: Infinity }
          );
          _showExampleModal = true;
        } else {
          isFileValid = true;
          buttonState = "ready";
          toast.success(
            `The uploaded CSV file is valid. ${documentKeys.length} document key(s) found.`
          );
        }
      } else {
        isFileValid = false;
        buttonState = "ready";
        toast.error("The file appears to be empty. Please check and try again.", {
          duration: Infinity,
        });
      }
    },
    error: (error) => {
      console.error("Error parsing CSV:", error);
      isFileValid = false;
      buttonState = "ready";
      toast.error("Error parsing the file. Please check the format and try again.", {
        duration: Infinity,
      });
      _showExampleModal = true;
    },
  });
}

function _closeExampleModal(): void {
  _showExampleModal = false;
  trackClick("ExampleModal", "Close");
}

function resetFileInput(): void {
  file = null;
  const fileInput = document.getElementById("fileInput") as HTMLInputElement;
  if (fileInput) {
    fileInput.value = "";
  }
}

function _handleSubmit(
  _event: Event
): (result: { type: string; data?: any; error?: string }) => Promise<void> {
  trackClick("SearchButton", isSearchMode ? "Search" : "FileUpload");
  buttonState = "searching";
  _processing = true;
  _errorMessage = "";
  searchResults = [];
  _fileUploadResults = [];
  _searchPerformed = true;
  _isLoading = true;

  return async ({ result }) => {
    try {
      console.log("Full result object:", result);
      if (result.type === "success") {
        const data = result.data;
        console.log("Data object:", data);
        if (isSearchMode) {
          if (data?.data?.searchDocuments) {
            searchResults = data.data.searchDocuments;
            const foundCollectionsCount = data.foundCollectionsCount;

            if (browser) {
              const tracker = getTracker();
              if (tracker) {
                tracker.event("GraphQL_Operation", {
                  operation: "searchDocuments",
                  documentKey: documentKey,
                  collectionsSearched: selectedCollections.length,
                  resultsFound: foundCollectionsCount,
                  success: true,
                });
              }
            }

            if (foundCollectionsCount === 0) {
              toast.error("No results found for the given document key.", {
                duration: Infinity,
              });
            } else {
              toast.success(
                `Search completed successfully. Document found in ${foundCollectionsCount} ${foundCollectionsCount === 1 ? "collection" : "collections"}.`,
                { duration: 3000 }
              );
            }
          } else {
            console.debug("Unexpected result structure:", result);
            throw new Error("Unexpected search results structure");
          }
        } else {
          // File upload handling
          if (Array.isArray(data.results)) {
            _fileUploadResults = data.results;
            toast.success(data.success || "File processed successfully.", {
              duration: 3000,
            });
          } else if (data?.error) {
            toast.error(data.error, {
              duration: Infinity,
            });
          } else {
            console.error("Unexpected file upload result structure:", data);
            throw new Error("Unexpected file upload result structure");
          }
        }
        buttonState = "results";
      } else if (result.type === "error") {
        console.error("Error from server:", result.error);

        let userMessage = "An unexpected error occurred. Please try again later.";

        if (result.error && typeof result.error === "object" && "message" in result.error) {
          const errorMessage = result.error.message as string;
          if (errorMessage.includes("socket connection was closed unexpectedly")) {
            userMessage = "The connection to the server was interrupted. Please try again.";
          }
        }

        toast.error(userMessage, { duration: Infinity });
        buttonState = "ready";
      }
    } catch (e) {
      console.error("Error in form submission:", e);
      toast.error("An unexpected error occurred. Please try again.", {
        duration: Infinity,
      });
      buttonState = "ready";
    } finally {
      _processing = false;
      _isLoading = false;
      if (!isSearchMode) {
        resetFileInput();
      }
    }
  };
}

let _fileUploadTooltipContent: string =
  "Upload a CSV file containing document keys to check in Capella. Each key should be on a separate line or column. No comma is needed after the last document key! The search will be performed across all collections.";

function _openTooltipModal(tooltipContent: string): void {
  _currentTooltip = tooltipContent;
  pushState("", { modalIsOpen: true });
  trackClick("TooltipModal", "Open");
}

function _closeModal(): void {
  replaceState("", { modalIsOpen: false });
  trackClick("TooltipModal", "Close");
}

let _buttonClass = $derived(
  isSearchMode
    ? {
        ready: !documentKey.trim()
          ? "cursor-not-allowed opacity-50"
          : "cursor-pointer hover:bg-[#00174f]/80",
        searching: "cursor-not-allowed",
        results: "cursor-not-allowed",
      }[buttonState]
    : !file || !isFileValid
      ? "cursor-not-allowed"
      : {
          ready: "cursor-pointer hover:bg-[#00174f]/80",
          searching: "cursor-not-allowed",
          results: "cursor-not-allowed",
        }[buttonState]
);

let _buttonText = $derived(
  {
    ready: isSearchMode ? "Search" : file ? "Search" : "Search",
    searching: isSearchMode ? "Searching..." : "Searching...",
    results: "Done",
  }[buttonState]
);

function _toggleMode(): void {
  isSearchMode = !isSearchMode;
  resetForm();
  trackClick("ModeToggle", isSearchMode ? "SwitchToSearch" : "SwitchToUpload");
  if (browser) {
    const tracker = getTracker();
    if (tracker) {
      tracker.event("Mode_Change", {
        newMode: isSearchMode ? "Search Document Key" : "Upload Document Keys",
        category: "User Interaction",
        action: "Toggle Mode",
      });
    }
  }
}

function resetForm(): void {
  buttonState = "ready";
  searchResults = [];
  _fileUploadResults = [];
  _errorMessage = "";
  _searchPerformed = false;
  documentKey = "";
  file = null;
}

let _isLoading = $state(false);

function _toggleCollection(collection: Collection) {
  const index = selectedCollections.findIndex(
    (c) =>
      c.bucket === collection.bucket &&
      c.scope_name === collection.scope_name &&
      c.collection_name === collection.collection_name
  );

  if (index !== -1) {
    selectedCollections = selectedCollections.filter((_, i) => i !== index);
  } else {
    selectedCollections = [...selectedCollections, collection];
  }

  console.log("Collection selection updated:", {
    selected: selectedCollections.length,
    total: allCollections.length,
  });
}

function _selectAllCollections(): void {
  selectedCollections = [...allCollections];
  trackClick("CollectionSelector", "SelectAll");
}

function _deselectAllCollections(): void {
  selectedCollections = [];
  trackClick("CollectionSelector", "DeselectAll");
}

function resetSearch(): void {
  buttonState = "ready";
  searchResults = [];
  _errorMessage = "";
  _searchPerformed = false;
}

function _handleInputClick(): void {
  if (buttonState === "results") {
    resetSearch();
  }
}

$effect(() => {
  if (documentKey) {
    resetSearch();
  }
});

$effect(() => {
  if (documentKey) {
    resetSearch();
  }
});

let _isSelected = $derived(
  (collection: { bucket: string; scope_name: string; collection_name: string }) => {
    return selectedCollections.some(
      (c) =>
        c.bucket === collection.bucket &&
        c.scope_name === collection.scope_name &&
        c.collection_name === collection.collection_name
    );
  }
);

function groupCollectionsByScope(collections: Collection[]): Record<string, Collection[]> {
  const sortedCollections = [...collections].sort((a, b) => {
    if (a.scope_name < b.scope_name) return -1;
    if (a.scope_name > b.scope_name) return 1;
    if (a.collection_name < b.collection_name) return -1;
    if (a.collection_name > b.collection_name) return 1;
    return 0;
  });

  return sortedCollections.reduce(
    (acc, collection) => {
      if (!acc[collection.scope_name]) {
        acc[collection.scope_name] = [];
      }
      acc[collection.scope_name] = [...acc[collection.scope_name], collection];
      return acc;
    },
    {} as Record<string, Collection[]>
  );
}

let _groupedCollections = $derived(groupCollectionsByScope(allCollections));

$effect(() => {
  if (isSearchMode && searchResults.length > 0) {
    _sortedResults = [...searchResults].sort((a, b) => {
      const aHasData = a.data !== null && Object.keys(a.data).length > 0;
      const bHasData = b.data !== null && Object.keys(b.data).length > 0;

      if (aHasData && !bHasData) {
        return -1;
      } else if (!aHasData && bHasData) {
        return 1;
      } else {
        return 0;
      }
    });
  } else {
    _sortedResults = [];
  }
});

function _handleCarouselStart() {
  console.log("Carousel started on another page");
}

function _handleCarouselEnd() {
  console.log("Carousel ended on another page");
}

let isOpen = false;

function _toggle() {
  isOpen = !isOpen;
}

$effect(() => {
  if (!page.state.modalIsOpen) {
    _currentTooltip = "";
  }
});
</script>

<svelte:head>
    <title>Capella Document Search</title>
    <meta name="Capella Document Search" content="Capella Document Search" />
</svelte:head>
<IdleVideoCarousel
    videos={$videos}
    idleTime={120000}
    onCarouselStart={_handleCarouselStart}
    onCarouselEnd={_handleCarouselEnd}
/>
<div class="min-h-screen flex flex-col bg-white dark:bg-[#2C2C2C] mb-20 mt-5">
    <!-- Logo Section -->
    <div class="text-center py-4">
        <img src="/favicon.png" alt="PVH" class="mx-auto h-16" />
    </div>

    <!-- Main Content -->
    <div class="flex-grow flex flex-col items-center px-4 mt-4">
        <div class="w-full max-w-6xl">
            <form
                use:enhance={_handleSubmit}
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
                                        data-transaction-name="Search Click"
                                        class="p-1 focus:outline-none focus:ring focus:ring-tommy-red/50 rounded-full"
                                        aria-label="Search documents"
                                        title="Search documents"
                                    >
                                        <svg
                                            fill="currentColor"
                                            viewBox="0 0 512 512"
                                            class="w-4 h-4 text-gray-500"
                                            aria-hidden="true"
                                            role="img"
                                        >
                                            <path
                                                d="M479.6,399.716l-81.084-81.084-62.368-25.767A175.014,175.014,0,0,0,368,192c0-97.047-78.953-176-176-176S16,94.953,16,192,94.953,368,192,368a175.034,175.034,0,0,0,101.619-32.377l25.7,62.2L400.4,478.911a56,56,0,1,0,79.2-79.195ZM48,192c0-79.4,64.6-144,144-144s144,64.6,144,144S271.4,336,192,336,48,271.4,48,192ZM456.971,456.284a24.028,24.028,0,0,1-33.942,0l-76.572-76.572-23.894-57.835L380.4,345.771l76.573,76.572A24.028,24.028,0,0,1,456.971,456.284Z"
                                            />
                                        </svg>
                                        <span class="sr-only">Search documents</span>
                                    </button>
                                </span>
                                <input
                                    type="text"
                                    autocomplete="off"
                                    spellcheck="false"
                                    id="documentKey"
                                    name="documentKey"
                                    data-transaction-name="Enter Document Key"
                                    bind:value={documentKey}
                                    oninput={(e) => {
                                        documentKey = e.target.value.trim();
                                        _searchPerformed = false;
                                    }}
                                    onclick={_handleInputClick}
                                    placeholder="Search for a single Document by typing in the Key here and click the Search button below..."
                                    class="w-full py-2 pl-10 pr-4 text-sm rounded-md focus:outline-none bg-white border border-gray-300 text-gray-900 focus:ring-2 focus:ring-tommy-red focus:border-tommy-red transition duration-150 ease-in-out"
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
                                            class="cursor-pointer flex flex-col items-center"
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                viewBox="0 0 24 24"
                                                aria-hidden="true"
                                                fill="currentColor"
                                                class="w-12 h-12 opacity-75 mb-2 group-hover:opacity-100 transition-opacity animate-bounce"
                                                data-transaction-name="Upload File Icon"
                                            >
                                                <path
                                                    fill-rule="evenodd"
                                                    d="M10.5 3.75a6 6 0 0 0-5.98 6.496A5.25 5.25 0 0 0 6.75 20.25H18a4.5 4.5 0 0 0 2.206-8.423 3.75 3.75 0 0 0-4.133-4.303A6.001 6.001 0 0 0 10.5 3.75Zm2.03 5.47a.75.75 0 0 0-1.06 0l-3 3a.75.75 0 1 0 1.06 1.06l1.72-1.72v4.94a.75.75 0 0 0 1.5 0v-4.94l1.72 1.72a.75.75 0 1 0 1.06-1.06l-3-3Z"
                                                    clip-rule="evenodd"
                                                    data-transaction-name="Upload File Icon"
                                                />
                                            </svg>
                                            <span
                                                class="font-medium text-blue-700 dark:text-blue-600 p-2 rounded-full focus-within:outline-none focus-within:ring focus-within:ring-tommy-red/50 hover:ring hover:ring-tommy-red/50 transition-all duration-300"
                                                data-transaction-name="Upload File Click"
                                            >
                                                Upload
                                            </span>
                                            <input
                                                id="fileInput"
                                                name="file"
                                                type="file"
                                                data-transaction-name="Select File"
                                                class="sr-only"
                                                aria-describedby="validFileFormats"
                                                accept=".csv"
                                                onchange={_handleFileChange}
                                                bind:files={fileInputFiles}
                                            />
                                        </label>
                                        <span class="mt-1 flex items-center">
                                            a file with multiple Document keys to check in bulk here
                                            <button
                                                onclick={(e) => {
                                                    e.preventDefault();
                                                    _openTooltipModal(_fileUploadTooltipContent);
                                                }}
                                                class="ml-2 text-gray-500 hover:text-gray-700 p-2 rounded-full focus:outline-none focus:ring focus:ring-tommy-red/50 hover:ring hover:ring-tommy-red/50 transition-all duration-300"
                                                aria-label="Show file upload information"
                                                data-transaction-name="Show File Upload Information"
                                            >
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                    class="w-4 h-4"
                                                    aria-hidden="true"
                                                    data-transaction-name="Show File Upload Information"
                                                >
                                                    <path
                                                        stroke-linecap="round"
                                                        stroke-linejoin="round"
                                                        stroke-width="2"
                                                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                                        data-transaction-name="Show File Upload Information"
                                                    />
                                                </svg>
                                                <span class="sr-only">Show file upload information</span>
                                            </button>
                                        </span>
                                        <small
                                            id="validFileFormats"
                                            class="text-xs mt-1"
                                        >
                                            CSV file only (Document Keys Limit:
                                            {frontendConfig.csv
                                                .FILE_UPLOAD_LIMIT})
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

                    <!-- Mode toggle - Pill-shaped Single/Multi switcher -->
                    <div class="absolute top-0 right-0">
                        <div class="inline-flex bg-gray-100 rounded-full p-1 shadow-sm border border-gray-200 hover:ring-2 hover:ring-red-500 hover:ring-offset-2 transition-all duration-300">
                            <button
                                type="button"
                                onclick={() => { if (!isSearchMode) _toggleMode(); }}
                                data-transaction-name="Switch to Single Mode"
                                class="px-5 py-2 rounded-full font-medium text-sm transition-all duration-200 {isSearchMode ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white shadow-md' : 'text-gray-600 hover:text-gray-900'}"
                                title="Search for a single document"
                                aria-label="Switch to single document search"
                            >
                                Single
                            </button>
                            <button
                                type="button"
                                onclick={() => { if (isSearchMode) _toggleMode(); }}
                                data-transaction-name="Switch to Multi Mode"
                                class="px-5 py-2 rounded-full font-medium text-sm transition-all duration-200 {!isSearchMode ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white shadow-md' : 'text-gray-600 hover:text-gray-900'}"
                                title="Upload CSV for bulk search"
                                aria-label="Switch to bulk document search"
                            >
                                Multi
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Collections Section -->
                {#if isSearchMode}
                    <div class="mb-4">
                        <div class="flex justify-between items-center mb-2">
                            <h3 class="text-lg font-semibold">
                                Select <span class="text-[#551a8b]">Scopes</span> & Collections
                            </h3>
                            <div>
                                <button
                                    type="button"
                                    onclick={() => {
                                        if (selectedCollections.length === allCollections.length) {
                                            _deselectAllCollections();
                                        } else {
                                            _selectAllCollections();
                                        }
                                    }}
                                    data-transaction-name={selectedCollections.length === allCollections.length 
                                        ? "Deselect All Collections" 
                                        : "Select All Collections"}
                                    class="min-w-[120px] px-3 py-1 bg-[#00174f] text-white rounded hover:bg-[#00174f]/80 hover:ring-2 hover:ring-red-500 hover:ring-offset-2 transition-all duration-300"
                                >
                                    {selectedCollections.length === allCollections.length 
                                        ? "Deselect All" 
                                        : "Select All"}
                                </button>
                            </div>
                        </div>
                        <div
                            class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                        >
                            {#each Object.entries(_groupedCollections) as [scope, collections]}
                                <div class="border rounded p-3">
                                    <h4 class="font-semibold text-[#551a8b] mb-2">{scope}</h4>
                                    {#each collections as collection}
                                        <label
                                            for={`toggle-${collection.bucket}-${collection.scope_name}-${collection.collection_name}`}
                                            class="flex items-center justify-between cursor-pointer mb-2"
                                        >
                                            <span
                                                class="text-sm pr-2 flex items-center"
                                            >
                                                {collection.collection_name}
                                                <!-- {#if collection.tooltip_content}
                                                    <button
                                                        onclick={() => openTooltipModal(collection.tooltip_content)}
                                                        class="ml-2 text-gray-500 hover:text-gray-700 focus:outline-none"
                                                        aria-label="Show collection information"
                                                    >
                                                        <svg
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                            class="w-4 h-4"
                                                            aria-hidden="true"
                                                        >
                                                            <path
                                                                stroke-linecap="round"
                                                                stroke-linejoin="round"
                                                                stroke-width="2"
                                                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                                            />
                                                        </svg>
                                                        <span class="sr-only">Show information about {collection.collection_name}</span>
                                                    </button>
                                                {/if} -->
                                            </span>
                                            <div
                                                class="relative inline-flex items-center"
                                            >
                                                <input
                                                    id={`toggle-${collection.bucket}-${collection.scope_name}-${collection.collection_name}`}
                                                    type="checkbox"
                                                    data-transaction-name={`Toggle Collection: ${collection.collection_name}`}
                                                    class="peer sr-only"
                                                    role="switch"
                                                    checked={_isSelected(
                                                        collection,
                                                    )}
                                                    onchange={() =>
                                                        _toggleCollection(
                                                            collection,
                                                        )}
                                                />
                                                <div
                                                    class="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-tommy-red/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-light-blue hover:ring hover:ring-tommy-red/50 transition-all duration-300"
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
                        data-transaction-name={isSearchMode
                            ? "Search Document"
                            : "Upload File"}
                        disabled={isSearchMode
                            ? buttonState === "searching" ||
                              buttonState === "results" ||
                              !documentKey.trim()
                            : buttonState === "searching" ||
                              buttonState === "results" ||
                              !file ||
                              !isFileValid}
                        class="{_buttonClass} w-full sm:w-auto px-6 py-2 min-w-[150px] bg-[#00174f] text-white rounded-md transition duration-150 ease-in-out {(buttonState ===
                            'results' &&
                            isSearchMode) ||
                        (!isSearchMode &&
                            (!file ||
                                !isFileValid ||
                                buttonState === 'results'))
                            ? 'opacity-50'
                            : ''} flex items-center justify-center"
                    >
                        {#if _isLoading}
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
                        {_buttonText}
                    </button>
                </div>
            </form>

            <!-- Example Modal -->
            {#if _showExampleModal}
                <div
                    class="fixed inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                    role="dialog"
                    aria-modal="true"
                >
                    <div
                        class="w-full max-w-lg flex flex-col overflow-hidden rounded-lg bg-white shadow-xl"
                    >
                        <div
                            class="flex items-center justify-between bg-[#00174f] p-4 text-white"
                        >
                            <h3 class="text-xl font-semibold">
                                CSV File Examples
                            </h3>
                            <button
                                onclick={_closeExampleModal}
                                data-transaction-name="Close Example Modal"
                                class="text-white hover:text-gray-200 focus:outline-none"
                                aria-label="close modal"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="h-6 w-6"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                        </div>
                        <div
                            class="p-6 overflow-y-auto max-h-[calc(100vh-200px)]"
                        >
                            <p class="mb-4">
                                Your CSV file can be in one of these two
                                formats:
                            </p>

                            <h4 class="font-semibold mt-4 mb-2">
                                1. Single-line format:
                            </h4>
                            <pre
                                class="bg-gray-100 p-3 rounded-md text-sm overflow-x-auto whitespace-pre-wrap break-all">
IMAGE_70_C51_K50K509654GE7, IMAGE_01_B92_MW0MW10752403, IMAGE_04_C51_KB0KB09658PMT</pre>
                            <p class="mt-2 text-sm">
                                In this format, all document keys are on a
                                single line, separated by commas.
                            </p>

                            <h4 class="font-semibold mt-6 mb-2">
                                2. Multi-line format:
                            </h4>
                            <pre
                                class="bg-gray-100 p-3 rounded-md text-sm whitespace-pre-wrap">
IMAGE_01_B92_MW0MW10752403,
IMAGE_04_C51_KB0KB09658PMT,
IMAGE_10_C34_AW0AW14437XI4,
IMAGE_70_C51_K50K509654GE7,
IMAGE_70_C51_LV04F1003GPDE</pre>
                            <p class="mt-2 text-sm">
                                In this format, each document key is on a
                                separate line, optionally followed by a comma.
                            </p>

                            <div
                                class="mt-6 bg-blue-50 border-l-4 border-blue-500 p-4 rounded"
                            >
                                <h5 class="font-semibold text-blue-700 mb-2">
                                    Important Notes:
                                </h5>
                                <ul
                                    class="list-disc list-inside text-sm text-blue-800 space-y-1"
                                >
                                    <li>
                                        Each document key should be a non-empty
                                        string.
                                    </li>
                                    <li>
                                        The file should contain between 1 and {frontendConfig
                                            .csv.FILE_UPLOAD_LIMIT}
                                        document keys.
                                    </li>
                                    <li>
                                        Trailing commas are optional and will be
                                        ignored.
                                    </li>
                                    <li>
                                        Leading and trailing whitespace will be
                                        removed from each key.
                                    </li>
                                    <li>Empty lines will be ignored.</li>
                                </ul>
                            </div>
                        </div>
                        <div class="flex justify-end bg-gray-100 px-6 py-4">
                            <button
                                onclick={_closeExampleModal}
                                data-transaction-name="Close Example Modal"
                                type="button"
                                class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                                aria-label="Close example modal"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            {/if}

            <!-- Search Results and Error Messages -->
            {#if _errorMessage}
                <p class="text-red-600 mt-4">{_errorMessage}</p>
            {/if}

            {#if isSearchMode && searchResults.length > 0}
                {#each _sortedResults as result}
                    <DocumentDisplay
                        bucket={result.bucket}
                        scope={result.scope}
                        collection={result.collection}
                        data={result.data}
                        timeTaken={result.timeTaken}
                        {documentKey}
                    />
                {/each}
            {:else if !isSearchMode && _fileUploadResults.length > 0}
                <FileUploadResults results={_fileUploadResults} />
            {/if}

            {#if _showDebugInfo}
                <div class="mt-4">
                    <h3>Debug Information:</h3>
                    <pre>{JSON.stringify(
                            {
                                processing: _processing,
                                errorMessage: _errorMessage,
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
        <div class="max-w-lg flex flex-col gap-4 overflow-hidden rounded-xl border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <div class="flex items-center justify-between border-b border-slate-300 bg-[#00174f] p-4 dark:border-slate-700 dark:bg-slate-900/20">
                <h3 class="font-semibold tracking-wide text-white dark:text-white">
                    Tool Tip
                </h3>
            </div>
            <div class="px-4 py-8">
                <p>{_currentTooltip}</p>
            </div>
            <div class="flex justify-end border-t border-slate-300 bg-slate-100/60 p-4 dark:border-slate-700 dark:bg-slate-900/20">
                <button
                    onclick={_closeModal}
                    type="button"
                    data-transaction-name="Tooltip Modal"
                    class="cursor-pointer whitespace-nowrap rounded-xl bg-blue-700 px-4 py-2 text-center text-sm font-medium tracking-wide text-slate-100 transition hover:text-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 active:opacity-100 active:outline-offset-0 dark:bg-blue-600 dark:text-slate-100 dark:focus-visible:outline-blue-600"
                    aria-label="Close tooltip modal"
                >
                    Close
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Add this anywhere in your page -->
{#if import.meta.env.DEV}
    <FeatureFlagDebug />
{/if}