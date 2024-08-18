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
                {#each results as result}
                    {#if isDetailedResult(result)}
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
                                            <ul
                                                class="list-inside list-none pl-0"
                                            >
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
                                            <ul
                                                class="list-none pl-0 list-inside"
                                            >
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
                    {/if}
                {/each}
            </tbody>
        </table>
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
