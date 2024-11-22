<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { browser } from "$app/environment";
  import { getContext, onMount, createEventDispatcher, onDestroy } from "svelte";
  import { key } from "$lib/context/tracker";
  import { getFeatureFlag, trackEvent, waitForTracker } from "$lib/context/tracker";
  import { userAccount } from '$lib/stores/authStore';
  
  const dispatch = createEventDispatcher();
  
  interface Props {
    isOpen?: boolean;
  }
  
  const { isOpen = false } = $props<Props>();
  let isFeatureEnabled = $state(false);
  let isInitialized = $state(false);
  let newMessage = $state('');
  
  // Get first name from full name
  function getFirstName(fullName: string = ''): string {
    return fullName.split(' ')[0] || 'there';
  }
  
  let messages = $state([
    { 
      type: 'bot', 
      text: `Hello ${getFirstName($userAccount?.name)}! How can I help you today?` 
    }
  ]);
  
  onMount(async () => {
    try {
      // Wait for tracker to be ready
      const trackerReady = await waitForTracker();
      console.debug('🤖 Chat Assistant Init:', {
        trackerReady,
        timestamp: new Date().toISOString()
      });

      // Even if tracker isn't ready, we'll show the chat if authenticated
      if (!trackerReady) {
        console.warn('🤖 Chat Assistant: Tracker not ready, but continuing');
        isFeatureEnabled = true;
        isInitialized = true;
        return;
      }

      // Get feature flag value
      const flagValue = await getFeatureFlag('rag-chat-assistant');
      isFeatureEnabled = true; // Default to true even if flag check fails
      isInitialized = true;
      
      console.debug('🤖 Chat Assistant Status:', {
        isVisible: isFeatureEnabled,
        flagValue,
        flagKey: 'rag-chat-assistant',
        component: 'chat-popup',
        isInitialized,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error initializing chat assistant:', error);
      isFeatureEnabled = true; // Default to true even on error
      isInitialized = true;
    }
  });
  
  function toggleChat() {
    dispatch('toggle');
    
    if (browser) {
      trackEvent("User_Interaction", {
        type: "click",
        element: "ChatAssistant",
        action: !isOpen ? "OpenChat" : "CloseChat",
        page: "Document Search",
        metadata: {
          featureEnabled: isFeatureEnabled
        }
      });
    }
  }

  // Add cleanup on component destruction
  onDestroy(() => {
    if (browser) {
        // Ensure body overflow is restored when component is destroyed
        document.body.style.overflow = '';
    }
  });

  function handleSubmit() {
    if (newMessage.trim()) {
      messages = [...messages, { type: 'user', text: newMessage }];
      
      // Track message sent event
      if (browser) {
        trackEvent("User_Interaction", {
          type: "submit",
          element: "ChatAssistant",
          action: "SendMessage",
          page: "Document Search",
          metadata: {
            messageLength: newMessage.length
          }
        });
      }
      
      // Add your chatbot logic here
      newMessage = '';
    }
  }

  $effect(() => {
    console.debug('🤖 Chat Assistant Status Changed:', {
      isVisible: isFeatureEnabled,
      isOpen,
      timestamp: new Date().toISOString()
    });
  });
</script>

{#if isInitialized && isFeatureEnabled}
  <button
    type="button"
    onclick={toggleChat}
    class="fixed bottom-24 right-6 z-[45] rounded-full bg-[#00174f] p-4 text-white shadow-lg hover:bg-[#00174f]/90 transition-all duration-300"
    aria-label="Toggle chat"
  >
    {#if !isOpen}
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
        <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
      </svg>
    {:else}
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
      </svg>
    {/if}
  </button>

  {#if isOpen}
    <button
      type="button"
      class="fixed inset-0 bg-black/20 backdrop-blur-sm z-[46]"
      onclick={toggleChat}
      onkeydown={(e) => e.key === 'Escape' && toggleChat()}
      aria-label="Close chat overlay"
      role="button"
    ></button>
    <div 
      class="fixed bottom-40 right-6 w-[400px] max-w-[calc(100vw-3rem)] z-[46] rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900"
      role="dialog"
      aria-modal="true"
      aria-label="Chat window"
    >
      <div class="flex flex-col h-[600px] max-h-[calc(100vh-8rem)]">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-gray-200 bg-[#00174f] p-4 dark:border-gray-800">
          <h2 class="font-semibold text-white">Chat Assistant</h2>
          <Button 
            variant="ghost" 
            size="icon" 
            onclick={toggleChat} 
            class="text-white hover:text-gray-200"
            aria-label="Close chat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </Button>
        </div>

        <!-- Messages -->
        <div 
          class="flex-1 overflow-y-auto p-4 space-y-4"
          role="log"
          aria-label="Chat messages"
        >
          {#each messages as message}
            <div class="flex {message.type === 'user' ? 'justify-end' : 'justify-start'}">
              <div 
                class="rounded-lg px-4 py-2 max-w-[80%] {message.type === 'user' ? 'bg-[#00174f] text-white' : 'bg-gray-100 dark:bg-gray-800'}"
                role="article"
                aria-label={message.type === 'user' ? 'Your message' : 'Assistant message'}
              >
                {message.text}
              </div>
            </div>
          {/each}
        </div>

        <!-- Input -->
        <form 
          onsubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          class="border-t border-gray-200 p-4 dark:border-gray-800"
        >
          <div class="flex gap-2">
            <input
              type="text"
              bind:value={newMessage}
              placeholder="Type your message..."
              class="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#00174f] dark:border-gray-700 dark:bg-gray-800"
              aria-label="Message input"
            />
            <Button 
              type="submit" 
              class="bg-[#00174f] hover:bg-[#00174f]/90"
              aria-label="Send message"
            >
              Send
            </Button>
          </div>
        </form>
      </div>
    </div>
  {/if}
{/if}

<style>
  /* Add styles to handle scrolling */
  :global(body.chat-open) {
    overflow-y: auto !important;
    padding-right: 15px; /* Prevent layout shift when scrollbar disappears */
  }
</style>
