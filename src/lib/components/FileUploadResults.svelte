<!-- src/lib/components/FileUploadResults.svelte -->

<script lang="ts">
    type DetailedResult = {
        documentKey: string;
        found: boolean;
        collections: {
            bucket: string;
            scope: string;
            collection: string;
            timeTaken: number;
        }[];
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
</script>

<div class="mt-4">
    <h2 class="text-xl font-bold mb-4">File Upload Results</h2>
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
                        class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                        Collections Found
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
                                {#if result.found}
                                    <ul class="list-disc list-inside">
                                        {#each result.collections as collection}
                                            <li>
                                                {collection.bucket}/{collection.scope}/{collection.collection}
                                                (Time: {collection.timeTaken}ms)
                                            </li>
                                        {/each}
                                    </ul>
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
