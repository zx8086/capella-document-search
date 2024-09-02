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
    export let results: (DetailedResult | SimpleResult)[];

    let foundCount = 0;
    let notFoundCount = 0;
    let sortedResults: DetailedResult[] = [];

    $: {
        if (results.length > 0 && isDetailedResult(results[0])) {
            sortedResults = (results as DetailedResult[]).sort((a, b) => {
                if (a.found && !b.found) return -1;
                if (!a.found && b.found) return 1;
                return 0;
            });
            foundCount = sortedResults.filter((r) => r.found).length;
            notFoundCount = sortedResults.filter((r) => !r.found).length;
        }
    }

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

<div class="mt-16">
    {#if results.length > 0 && isDetailedResult(results[0])}
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th
                        class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                        Document Key
                    </th>
                    <th
                        class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                        Status
                    </th>
                    <th
                        class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/4"
                    >
                        Found In
                    </th>
                    <th
                        class="px-5 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3"
                    >
                        Search Summary
                    </th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
                {#each sortedResults as result}
                    <tr>
                        <td class="px-6 py-4 whitespace-nowrap">
                            {result.documentKey}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap">
                            {#if result.found}
                                <span
                                    class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800"
                                >
                                    Found
                                </span>
                            {:else}
                                <span
                                    class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800"
                                >
                                    Not Found
                                </span>
                            {/if}
                        </td>
                        <td class="px-6 py-4">
                            {#if result.foundIn.length > 0}
                                <p>
                                    Found in {result.foundIn.length} of {result.totalCollectionsSearched}
                                    collections
                                </p>
                                <details class="mt-2">
                                    <summary
                                        class="cursor-pointer text-blue-600 hover:text-blue-800 flex items-center"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke-width="1.5"
                                            stroke="currentColor"
                                            class="w-4 h-4 mr-1 inline-block"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                d="m5.25 4.5 7.5 7.5-7.5 7.5m6-15 7.5 7.5-7.5 7.5"
                                            />
                                        </svg>
                                        <span>View matched</span>
                                    </summary>
                                    <div class="mt-2 ml-4 max-w-md">
                                        <ul class="list-inside list-none pl-0">
                                            {#each result.foundIn as collection}
                                                <li
                                                    class="text-sm text-gray-600"
                                                >
                                                    {collection.bucket}/{collection.scope}/{collection.collection}
                                                </li>
                                            {/each}
                                        </ul>
                                    </div>
                                </details>
                            {:else}
                                <span class="text-gray-500"
                                    >Not found in any collection</span
                                >
                            {/if}
                        </td>
                        <td class="px-6 py-4">
                            <p>
                                Found in {result.foundIn.length} of {result.totalCollectionsSearched}
                                collections
                            </p>
                            {#if result.notFoundIn.length > 0}
                                <details class="mt-2">
                                    <summary
                                        class="cursor-pointer text-blue-600 hover:text-blue-800 flex items-center"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke-width="1.5"
                                            stroke="currentColor"
                                            class="w-4 h-4 mr-1 inline-block"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                d="m5.25 4.5 7.5 7.5-7.5 7.5m6-15 7.5 7.5-7.5 7.5"
                                            />
                                        </svg>
                                        <span>View not matched</span>
                                    </summary>
                                    <div class="mt-2 ml-4 max-w-md">
                                        <ul class="list-none pl-0 list-inside">
                                            {#each result.notFoundIn as collection}
                                                <li
                                                    class="text-sm text-gray-600"
                                                >
                                                    {collection.bucket}/{collection.scope}/{collection.collection}
                                                </li>
                                            {/each}
                                        </ul>
                                    </div>
                                </details>
                            {/if}
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
        <div class="mt-4 flex justify-between items-center">
            <div class="flex items-center">
                <span class="font-bold mr-2">Total Found: {foundCount}</span>
                <button
                    on:click={() => downloadCSV("found")}
                    class="p-2 rounded-full bg-green-100 hover:bg-green-200 transition-colors duration-200"
                    title="Download Found Keys"
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
            </div>
            <div class="flex items-center">
                <span class="font-bold mr-2"
                    >Total Not Found: {notFoundCount}</span
                >
                <button
                    on:click={() => downloadCSV("notFound")}
                    class="p-2 rounded-full bg-red-100 hover:bg-red-200 transition-colors duration-200"
                    title="Download Not Found Keys"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="w-6 h-6 text-red-600"
                    >
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
        <div class="bg-white shadow overflow-hidden sm:rounded-lg">
            <div class="px-4 py-5 sm:p-6">
                {#each results as result}
                    {#if "message" in result}
                        <p class="text-sm text-gray-500">{result.message}</p>
                    {/if}
                {/each}
            </div>
        </div>
    {/if}
</div>
