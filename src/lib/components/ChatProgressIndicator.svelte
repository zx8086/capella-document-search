<!-- src/lib/components/ChatProgressIndicator.svelte -->

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  
  interface Props {
    isActive: boolean;
    message?: string;
    details?: string;
    elapsedTime?: number;
    showElapsedTime?: boolean;
    tokenUsage?: {
      input: number;
      output: number;
      total: number;
    };
    estimatedCost?: number;
  }
  
  const { 
    isActive = false,
    message = "Processing your request...",
    details = "",
    elapsedTime = 0,
    showElapsedTime = true,
    tokenUsage = null,
    estimatedCost = null
  }: Props = $props();
  
  let internalElapsedTime = $state(elapsedTime || 0);
  let interval: any;
  
  // Format elapsed time to human-readable format
  function formatElapsedTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  }
  
  // Start/stop timer based on isActive
  $effect(() => {
    if (isActive) {
      interval = setInterval(() => {
        internalElapsedTime += 1000;
      }, 1000);
    } else {
      if (interval) {
        clearInterval(interval);
      }
      internalElapsedTime = 0;
    }
  });
  
  // Update internal timer when external elapsed time changes
  $effect(() => {
    if (elapsedTime !== undefined && elapsedTime > 0) {
      internalElapsedTime = elapsedTime;
    }
  });
  
  onDestroy(() => {
    if (interval) {
      clearInterval(interval);
    }
  });
</script>

{#if isActive}
  <div class="fixed bottom-48 right-8 z-[47] bg-white dark:bg-gray-900 shadow-lg rounded-lg border border-gray-200 dark:border-gray-700 p-4 max-w-sm animate-in slide-in-from-bottom-2 duration-300">
    <div class="flex items-start gap-3">
      <!-- Animated spinner -->
      <div class="flex-shrink-0">
        <div class="relative">
          <div class="w-8 h-8">
            <svg class="animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.25"/>
              <path d="M12 2a10 10 0 0 1 0 20" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="text-blue-600 dark:text-blue-400"/>
            </svg>
          </div>
          {#if internalElapsedTime > 30000}
            <!-- Warning indicator for long-running requests -->
            <div class="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full animate-pulse"></div>
          {/if}
        </div>
      </div>
      
      <!-- Progress content -->
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
          {message}
        </p>
        {#if details}
          <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
            {details}
          </p>
        {/if}
        {#if showElapsedTime || tokenUsage}
          <div class="mt-2 flex items-center gap-2 flex-wrap">
            {#if showElapsedTime}
              <span class="text-xs text-gray-500 dark:text-gray-500">
                Elapsed: {formatElapsedTime(internalElapsedTime)}
              </span>
            {/if}
            {#if tokenUsage}
              <span class="text-xs text-gray-500 dark:text-gray-500">
                • Tokens: {tokenUsage.total.toLocaleString()}
              </span>
              {#if estimatedCost}
                <span class="text-xs text-gray-500 dark:text-gray-500">
                  • Cost: ${estimatedCost.toFixed(4)}
                </span>
              {/if}
            {/if}
            {#if internalElapsedTime > 60000}
              <span class="text-xs text-amber-600 dark:text-amber-400">
                • Complex query in progress
              </span>
            {/if}
          </div>
        {/if}
        
        <!-- Progress bar -->
        <div class="mt-2 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div class="h-full bg-blue-600 dark:bg-blue-400 animate-progress-indeterminate"></div>
        </div>
      </div>
    </div>
    
    <!-- Timeout warning -->
    {#if internalElapsedTime > 240000}
      <div class="mt-3 p-2 bg-amber-50 dark:bg-amber-900/20 rounded text-xs text-amber-800 dark:text-amber-200">
        ⚠️ This request is taking longer than usual. It may timeout soon.
      </div>
    {/if}
  </div>
{/if}

<style>
  @keyframes progress-indeterminate {
    0% {
      transform: translateX(-100%);
    }
    50% {
      transform: translateX(0%);
    }
    100% {
      transform: translateX(100%);
    }
  }
  
  .animate-progress-indeterminate {
    animation: progress-indeterminate 2s ease-in-out infinite;
  }
  
  /* Animate in/out */
  .animate-in {
    animation: slideIn 0.3s ease-out;
  }
  
  @keyframes slideIn {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
</style>