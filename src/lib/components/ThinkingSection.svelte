<!-- src/lib/components/ThinkingSection.svelte -->
<script lang="ts">
  interface Props {
    isThinking?: boolean;
    thinkingText?: string;
  }
  
  const { 
    isThinking = false, 
    thinkingText = '' 
  } = $props<Props>();
  
  let expanded = $state(false); // Collapsed by default
  
  function toggleExpanded() {
    expanded = !expanded;
  }
</script>

{#if thinkingText && !isThinking}
  <div class="thinking-section border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400 rounded-r-md my-2 w-full">
    <button 
      type="button"
      onclick={toggleExpanded}
      class="w-full flex items-center justify-between p-3 text-left hover:bg-blue-100 dark:hover:bg-blue-800/30 transition-colors duration-200"
      aria-expanded={expanded}
      aria-label={expanded ? "Collapse AI reasoning" : "Expand AI reasoning"}
    >
      <div class="flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423L16.5 15.75l.394 1.183a2.25 2.25 0 0 0 1.423 1.423L19.5 18.75l-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
        </svg>
        <span class="font-medium text-blue-700 dark:text-blue-300">AI Reasoning</span>
      </div>
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        fill="none" 
        viewBox="0 0 24 24" 
        stroke-width="1.5" 
        stroke="currentColor" 
        class="w-4 h-4 text-blue-600 dark:text-blue-400 transition-transform duration-200 {expanded ? 'rotate-180' : ''}"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
      </svg>
    </button>
    
    <div class="thinking-content {expanded ? 'expanded' : 'collapsed'}">
      <div class="px-3 pb-3">
        <div class="text-sm text-blue-700 dark:text-blue-300 whitespace-pre-wrap bg-white dark:bg-gray-800 p-3 rounded border border-blue-200 dark:border-blue-700">
          {thinkingText}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .thinking-section {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    width: 100%;
    min-width: 300px;
  }
  
  .thinking-content {
    transition: max-height 0.3s ease-in-out, opacity 0.3s ease-in-out;
    overflow: hidden;
  }
  
  .thinking-content.collapsed {
    max-height: 0;
    opacity: 0;
  }
  
  .thinking-content.expanded {
    max-height: 500px; /* Adjust based on expected content height */
    opacity: 1;
  }
</style>