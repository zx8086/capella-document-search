<!-- src/lib/components/FileUploadResults.svelte -->

<script lang="ts">
    import { onMount } from "svelte";

    type DetailedResult = {
        documentKey: string;
        found: boolean;
        foundIn: {
            bucket: string;
            scope: string;
            collection: string;
            timeTaken: number;
        }[];
        notFoundIn: {
            bucket: string;
            scope: string;
            collection: string;
        }[];
        totalCollectionsSearched: number;
    };
    type SimpleResult = {
        message: string;
    };
    interface Props {
        results: (DetailedResult | SimpleResult)[];
    }

    let { results } = $props();

    let foundCount = $state(0);
    let notFoundCount = $state(0);
    let sortedResults = $state<DetailedResult[]>([]);

    $effect(() => {
        if (results.length > 0 && isDetailedResult(results[0])) {
            sortedResults = [...results].sort((a, b) => {
                if (a.found && !b.found) return -1;
                if (!a.found && b.found) return 1;
                return 0;
            });
            foundCount = results.filter(r => isDetailedResult(r) && r.found).length;
            notFoundCount = results.filter(r => isDetailedResult(r) && !r.found).length;
        } else {
            sortedResults = [];
            foundCount = 0;
            notFoundCount = 0;
        }
    });

    function isDetailedResult(
        result: DetailedResult | SimpleResult,
    ): result is DetailedResult {
        return "documentKey" in result;
    }

    function handleToggle(event: Event) {
        const details = event.target as HTMLDetailsElement;
        const icon = details.querySelector("svg");
        if (icon) {
            if (details.open) {
                icon.innerHTML =
                    '<path stroke-linecap="round" stroke-linejoin="round" d="m4.5 5.25 7.5 7.5 7.5-7.5m-15 6 7.5 7.5 7.5-7.5" />';
            } else {
                icon.innerHTML =
                    '<path stroke-linecap="round" stroke-linejoin="round" d="m5.25 4.5 7.5 7.5-7.5 7.5m6-15 7.5 7.5-7.5 7.5" />';
            }
        }
    }

    function downloadCSV(type: "found" | "notFound") {
        const filteredResults = sortedResults.filter(
            (r) => r.found === (type === "found"),
        );
        const csv = filteredResults.map((r) => r.documentKey).join(",\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `${type}_document_keys.csv`);
            link.style.visibility = "hidden";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    onMount(() => {
        const detailsElements = document.querySelectorAll("details");
        detailsElements.forEach((details) => {
            details.addEventListener("toggle", handleToggle);
        });

        return () => {
            detailsElements.forEach((details) => {
                details.removeEventListener("toggle", handleToggle);
            });
        };
    });
</script>

<div class="mt-8">
    {#if results.length > 0 && isDetailedResult(results[0])}
        <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Document Key
                        </th>
                        <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                        </th>
                        <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Found In
                        </th>
                        <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Search Summary
                        </th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    {#each sortedResults as result}
                        <tr>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {result.documentKey}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {#if result.found}
                                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                        Found
                                    </span>
                                {:else}
                                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                                        Not Found
                                    </span>
                                {/if}
                            </td>
                            <td class="px-6 py-4 text-sm text-gray-500">
                                {#if result.foundIn.length > 0}
                                    <details>
                                        <summary class="cursor-pointer text-blue-600 hover:text-blue-800">
                                            View locations ({result.foundIn.length})
                                        </summary>
                                        <ul class="mt-2 list-disc pl-5">
                                            {#each result.foundIn as location}
                                                <li>{location.bucket}/{location.scope}/{location.collection}</li>
                                            {/each}
                                        </ul>
                                    </details>
                                {:else}
                                    Not found in any collection
                                {/if}
                            </td>
                            <td class="px-6 py-4 text-sm text-gray-500">
                                Found in {result.foundIn.length} of {result.totalCollectionsSearched} collections
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>

        <div class="mt-4 flex justify-between items-center">
            <div class="flex items-center space-x-2">
                <span class="font-bold">Total Found: {foundCount}</span>
                <button
                    onclick={() => downloadCSV('found')}
                    class="p-2 rounded-full bg-green-100 hover:bg-green-200 transition-colors duration-200"
                    title="Download Found Keys"
                    aria-label="Download Found Document Keys"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-green-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
                    </svg>
                    <span class="sr-only">Download Found Document Keys</span>
                </button>
            </div>
            <div class="flex items-center space-x-2">
                <span class="font-bold">Total Not Found: {notFoundCount}</span>
                <button
                    onclick={() => downloadCSV('notFound')}
                    class="p-2 rounded-full bg-red-100 hover:bg-red-200 transition-colors duration-200"
                    title="Download Not Found Keys"
                    aria-label="Download Not Found Document Keys"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-red-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
                    </svg>
                    <span class="sr-only">Download Not Found Document Keys</span>
                </button>
            </div>
        </div>
    {:else}
        <div class="text-center py-4">
            <p class="text-gray-500">No results to display</p>
        </div>
    {/if}
</div>
