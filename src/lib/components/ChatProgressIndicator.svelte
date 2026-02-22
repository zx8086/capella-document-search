<!-- src/lib/components/ChatProgressIndicator.svelte -->

<script lang="ts">
import { onDestroy } from "svelte";

interface Props {
  isActive: boolean;
  message?: string;
  details?: string;
  showElapsedTime?: boolean;
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
  } | null;
  estimatedCost?: number | null;
}

const {
  isActive = false,
  message = "Processing your request...",
  details = "",
  showElapsedTime = true,
  tokenUsage = null,
  estimatedCost = null,
}: Props = $props();

let startTime = $state<number | null>(null);
let elapsedTime = $state(0);
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
    if (!startTime) {
      startTime = Date.now();
      console.log("[START] [ChatProgressIndicator] Component activated - Starting timer");
    }
    interval = setInterval(() => {
      elapsedTime = Date.now() - startTime!;
    }, 1000);
  } else {
    if (interval) {
      clearInterval(interval);
      console.log(
        "[STOP] [ChatProgressIndicator] Component deactivated - Timer stopped, elapsed time:",
        elapsedTime,
        "ms"
      );
    }
    startTime = null;
    elapsedTime = 0;
  }
});

onDestroy(() => {
  if (interval) {
    clearInterval(interval);
    console.log("[DESTROYED] [ChatProgressIndicator] Component destroyed - Cleanup complete");
  }
});
</script>

{#if isActive}
  <!-- Progress indicator overlay -->
  <div class="absolute inset-0 flex items-center justify-center z-50 pointer-events-none animate-in fade-in duration-300">
    <!-- Semi-transparent backdrop -->
    <div class="absolute inset-0 bg-black/10 dark:bg-black/20 rounded-lg pointer-events-auto"></div>
    
    <!-- Centered progress content -->
    <div class="relative bg-white dark:bg-gray-900 shadow-2xl rounded-lg border border-gray-200 dark:border-gray-700 p-6 w-[400px] h-[160px] pointer-events-auto">
    <div class="flex items-center gap-3 h-full">
      <!-- Animated spinner -->
      <div class="flex-shrink-0">
        <div class="relative">
          <div class="w-10 h-10">
            <svg class="animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" opacity="0.25"/>
              <path d="M12 2a10 10 0 0 1 0 20" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="text-blue-600 dark:text-blue-400"/>
            </svg>
          </div>
          {#if elapsedTime > 30000}
            <!-- Warning indicator for long-running requests -->
            <div class="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full animate-pulse"></div>
          {/if}
        </div>
      </div>
      
      <!-- Progress content -->
      <div class="flex-1 min-w-0 overflow-hidden">
        <p class="text-base font-medium text-gray-900 dark:text-gray-100 truncate">
          {message}
        </p>
        {#if details && !details.includes(formatElapsedTime(elapsedTime))}
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
            {details}
          </p>
        {/if}
        {#if showElapsedTime || tokenUsage}
          <div class="mt-2 flex items-center gap-2 flex-wrap">
            {#if showElapsedTime}
              <span class="text-xs text-gray-500 dark:text-gray-500">
                {formatElapsedTime(elapsedTime)}
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
            {#if elapsedTime > 60000 && elapsedTime <= 240000}
              <span class="text-xs text-amber-600 dark:text-amber-400">
                • Complex query in progress
              </span>
            {:else if elapsedTime > 240000}
              <span class="text-xs text-amber-600 dark:text-amber-400">
                • May timeout soon
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
    </div>
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
    animation: fadeIn 0.3s ease-out;
  }
  
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  
  .fade-in {
    animation: fadeIn 0.3s ease-out;
  }
</style>