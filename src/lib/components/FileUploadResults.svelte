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

    let expandedStates = $state<Record<string, boolean>>({});

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

    function toggleExpand(documentKey: string) {
        expandedStates[documentKey] = !expandedStates[documentKey];
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

    function handleToggle(event: Event) {
        const details = event.target as HTMLDetailsElement;
        const icon = details.querySelector("svg path");
        if (icon) {
            if (details.open) {
                icon.setAttribute('d', 'M19.5 8.25l-7.5 7.5-7.5-7.5m15 6l-7.5 7.5-7.5-7.5');
            } else {
                icon.setAttribute('d', 'M8.25 4.5l7.5 7.5-7.5 7.5M3 4.5l7.5 7.5-7.5 7.5');
            }
        }
    }
</script>

<div class="mt-8">
    {#if results.length > 0 && isDetailedResult(results[0])}
        <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th scope="col" class="w-1/4 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Document Key
                        </th>
                        <th scope="col" class="w-1/6 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                        </th>
                        <th scope="col" class="w-1/3 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Found In
                        </th>
                        <th scope="col" class="w-1/4 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Search Summary
                        </th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    {#each sortedResults as result}
                        <tr>
                            <td class="w-1/4 px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {result.documentKey}
                            </td>
                            <td class="w-1/6 px-6 py-4 whitespace-nowrap text-sm text-gray-500">
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
                            <td class="w-1/3 px-6 py-4 text-sm text-gray-500">
                                {#if result.foundIn.length > 0}
                                    <div>
                                        <button 
                                            onclick={() => toggleExpand(result.documentKey)}
                                            class="cursor-pointer text-blue-600 hover:text-blue-800 flex items-center space-x-2"
                                            aria-expanded={!!expandedStates[result.documentKey]}
                                        >
                                            {#if expandedStates[result.documentKey]}
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke-width="1.5"
                                                    stroke="currentColor"
                                                    class="size-6"
                                                    aria-hidden="true"
                                                    role="img"
                                                >
                                                    <title>Collapse details</title>
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
                                                    aria-hidden="true"
                                                    role="img"
                                                >
                                                    <title>Expand details</title>
                                                    <path
                                                        stroke-linecap="round"
                                                        stroke-linejoin="round"
                                                        d="m5.25 4.5 7.5 7.5-7.5 7.5m6-15 7.5 7.5-7.5 7.5"
                                                    />
                                                </svg>
                                            {/if}
                                            <span>View {result.foundIn.length === 1 ? 'collection' : 'collections'} ({result.foundIn.length})</span>
                                        </button>
                                        {#if expandedStates[result.documentKey]}
                                            <ul class="mt-2 list-disc pl-5">
                                                {#each result.foundIn as location}
                                                    <li>{location.bucket}/{location.scope}/{location.collection}</li>
                                                {/each}
                                            </ul>
                                        {/if}
                                    </div>
                                {:else}
                                    Not found in any collection
                                {/if}
                            </td>
                            <td class="w-1/4 px-6 py-4 text-sm text-gray-500">
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
                    class="p-2 rounded-full bg-green-100 hover:bg-green-200 transition-colors duration-200 focus:ring-2 focus:ring-offset-2 focus:ring-tommy-red"
                    aria-label="Download Found Document Keys"
                    data-transaction-name="Download Found Document Keys"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="w-6 h-6 text-green-600"
                        aria-hidden="true"
                        role="img"
                    >
                        <title>Download Found Keys</title>
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M12 9.75v6.75m0 0-3-3m3 3 3-3m-8.25 6a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
                        />
                    </svg>
                </button>
            </div>
            <div class="flex items-center space-x-2">
                <span class="font-bold">Total Not Found: {notFoundCount}</span>
                <button
                    onclick={() => downloadCSV('notFound')}
                    class="p-2 rounded-full bg-red-100 hover:bg-red-200 transition-colors duration-200 focus:ring-2 focus:ring-offset-2 focus:ring-tommy-red"
                    aria-label="Download Not Found Document Keys"
                    data-transaction-name="Download Not Found Document Keys"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="w-6 h-6 text-red-600"
                        aria-hidden="true"
                        role="img"
                    >
                        <title>Download Not Found Keys</title>
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M12 9.75v6.75m0 0-3-3m3 3 3-3m-8.25 6a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
                        />
                    </svg>
                </button>
            </div>
        </div>
    {:else}
        <div class="text-center py-4">
            <p class="text-gray-500">No results to display</p>
        </div>
    {/if}
</div>
