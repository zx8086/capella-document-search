<!-- src/lib/components/SuggestedQueries.svelte -->

<script lang="ts">
  interface Props {
    onQuerySelect: (query: string, enableExtendedThinking?: boolean) => void;
  }

  const { onQuerySelect } = $props<Props>();

  const suggestedQueries = [
    {
      text: "How does Tommy Hilfiger use Couchbase?",
      extendedThinking: false
    },
    {
      text: "Why would Developers use Couchbase?",
      extendedThinking: true
    },
    {
      text: "Are all my nodes healthy?",
      extendedThinking: false
    },
    {
      text: "Do I have long running queries?",
      extendedThinking: false
    }
  ];

  function handleQueryClick(query: { text: string; extendedThinking: boolean }) {
    onQuerySelect(query.text, query.extendedThinking);
  }
</script>

<div class="px-4 py-3">
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
    {#each suggestedQueries as query}
      <button
        type="button"
        onclick={() => handleQueryClick(query)}
        class="relative group text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700 
               bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700
               transition-all duration-200 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600
               hover:ring-2 hover:ring-red-500 hover:ring-offset-2
               focus:outline-none focus:ring-2 focus:ring-tommy-red/50 focus:ring-offset-2
               text-sm text-gray-700 dark:text-gray-300"
      >
        <div class="flex items-start justify-between gap-2">
          <span class="block pr-6">{query.text}</span>
          {#if query.extendedThinking}
            <div class="absolute top-2 right-2 flex items-center gap-1" title="Extended thinking enabled">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="w-4 h-4 text-blue-600 dark:text-blue-400"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
                />
              </svg>
            </div>
          {/if}
        </div>
      </button>
    {/each}
  </div>
</div>

<style>
  :global(.tommy-red) {
    color: #c8102e;
  }
  
  :global(.ring-tommy-red\/50) {
    --tw-ring-color: rgba(200, 16, 46, 0.5);
  }
</style>