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
  let isLoading = $state(false);
  
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
  
  // Fix the state warning by properly declaring messagesContainer
  let messagesContainer = $state<HTMLDivElement | null>(null);
  
  // Auto-scroll function
  function scrollToBottom() {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }
  
  // Watch messages for changes and scroll
  $effect(() => {
    if (messages.length) {
      setTimeout(scrollToBottom, 100); // Small delay to ensure content is rendered
    }
  });
  
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

  async function handleSubmit() {
    if (!newMessage.trim()) return;
    
    const userMessage = newMessage.trim();
    newMessage = '';
    isLoading = true;
    
    try {
        messages = [...messages, { type: 'user', text: userMessage }];
        messages = [...messages, { type: 'bot', text: '', isLoading: true }];

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: userMessage })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('Response body reader is null');
        }

        let accumulatedResponse = '';
        let buffer = '';
        const decoder = new TextDecoder();

        console.log('🔄 Starting stream processing');

        try {
            let streamComplete = false;
            
            while (!streamComplete) {
                console.log('📥 Reading next chunk...');
                const result = await reader.read();
                console.log('📦 Read result:', { done: result.done, hasValue: !!result.value });
                
                // Check for stream completion before processing value
                if (result.done) {
                    console.log('✅ Stream completed normally');
                    streamComplete = true;
                    break;
                }
                
                // Decode the current chunk and add it to the buffer
                const newText = decoder.decode(result.value, { stream: true });
                console.log('📝 Decoded chunk:', newText);
                buffer += newText;
                
                // Process complete lines from the buffer
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep the last incomplete line in the buffer
                
                console.log('📊 Processing lines:', { lineCount: lines.length, remainingBuffer: buffer });
                
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const data = JSON.parse(line);
                            console.log('🔍 Parsed data:', data);
                            
                            if (data.done) {
                                console.log('🏁 Received done signal');
                                streamComplete = true;
                                break;
                            }
                            
                            if (data.content) {
                                accumulatedResponse += data.content;
                                console.log('💬 Updated response:', accumulatedResponse);
                                messages = messages.map((msg, index) => 
                                    index === messages.length - 1 
                                        ? { type: 'bot', text: accumulatedResponse, isLoading: false }
                                        : msg
                                );
                            }
                        } catch (e) {
                            console.warn('⚠️ Failed to parse line:', line, e);
                        }
                    }
                }
                
                // Break the loop if we received the done signal
                if (streamComplete) {
                    console.log('🎯 Breaking loop due to done signal');
                    break;
                }
            }
            
            console.log('🎉 Stream processing completed successfully');
            
            // Process any remaining buffer content
            if (buffer.trim()) {
                console.log('📝 Processing final buffer:', buffer);
                try {
                    const data = JSON.parse(buffer);
                    if (data.content) {
                        accumulatedResponse += data.content;
                        messages = messages.map((msg, index) => 
                            index === messages.length - 1 
                                ? { type: 'bot', text: accumulatedResponse, isLoading: false }
                                : msg
                        );
                    }
                } catch (e) {
                    console.warn('⚠️ Failed to parse final buffer:', buffer, e);
                }
            }
            
            // Ensure final message state is set
            messages = messages.map((msg, index) => 
                index === messages.length - 1 
                    ? { type: 'bot', text: accumulatedResponse, isLoading: false }
                    : msg
            );
            
        } catch (error) {
            console.error('❌ Stream processing error:', error);
            throw error; // Re-throw to be handled by outer catch block
        } finally {
            console.log('🧹 Cleaning up stream resources');
            reader.releaseLock();
        }

    } catch (error) {
        console.error('❌ Chat error:', error);
        messages = messages.map((msg, i) => 
            i === messages.length - 1 
                ? { 
                    type: 'bot', 
                    text: 'I apologize, but I encountered an error processing your request. Please try again.',
                    isLoading: false 
                  }
                : msg
        );
    } finally {
        isLoading = false;
    }
  }

  $effect(() => {
    console.debug('🤖 Chat Assistant Status Changed:', {
      isVisible: isFeatureEnabled,
      isOpen,
      timestamp: new Date().toISOString()
    });
  });

  onMount(() => {
    if (browser) {
      // Calculate scrollbar width
      const scrollDiv = document.createElement('div');
      scrollDiv.style.width = '100px';
      scrollDiv.style.height = '100px';
      scrollDiv.style.overflow = 'scroll';
      scrollDiv.style.position = 'absolute';
      scrollDiv.style.top = '-9999px';
      document.body.appendChild(scrollDiv);
      
      const scrollbarWidth = scrollDiv.offsetWidth - scrollDiv.clientWidth;
      document.documentElement.style.setProperty('--scrollbar-width', `${scrollbarWidth}px`);
      
      document.body.removeChild(scrollDiv);
    }
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
    ></button>
    <div 
      class="fixed bottom-40 right-6 w-[600px] max-w-[calc(100vw-3rem)] z-[46] rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900"
      role="dialog"
      aria-modal="true"
      aria-label="Chat window"
    >
      <div class="flex flex-col h-[700px] max-h-[calc(100vh-6rem)]">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-gray-200 bg-[#00174f] p-4 dark:border-gray-800">
          <h2 class="font-bold text-white">Capella Document Search - Chat Assistant</h2>
          <Button 
            variant="ghost" 
            size="icon" 
            onclick={toggleChat} 
            class="text-white hover:bg-transparent hover:text-red-500 transition-colors duration-200"
            aria-label="Close chat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </Button>
        </div>

        <!-- Messages -->
        <div 
          bind:this={messagesContainer}
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
                {#if message.isLoading}
                    <div class="flex items-center justify-center p-2">
                        <div class="animate-spin rounded-full h-5 w-5 border-2 border-gray-500 border-t-transparent"></div>
                    </div>
                {:else}
                    <div class="whitespace-pre-wrap">
                        {#if message.type === 'bot'}
                            {#if message.text.includes('References:')}
                                {message.text.split('References:')[0]}
                                <div class="mt-2 text-sm text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-2">
                                    References:
                                    {#each message.text.split('References:')[1].trim().split('\n').filter(ref => ref.trim()) as ref}
                                        <div>- {ref.trim()}</div>
                                    {/each}
                                </div>
                            {:else}
                                {message.text}
                            {/if}
                        {:else}
                            {message.text}
                        {/if}
                    </div>
                {/if}
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
              placeholder={isLoading ? "Please wait..." : "Type your message..."}
              disabled={isLoading}
              class="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring focus:ring-tommy-red/50 dark:border-gray-700 bg-white text-black dark:bg-white dark:text-black disabled:opacity-50"
              aria-label="Message input"
            />
            <Button 
              type="submit" 
              class="bg-[#00174f] hover:bg-[#00174f]/90 disabled:opacity-50"
              disabled={isLoading}
              aria-label="Send message"
            >
              {#if isLoading}
                <div class="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              {:else}
                Send
              {/if}
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
    overflow-y: scroll !important;
    padding-right: var(--scrollbar-width, 15px) !important;
  }

  /* Add this script to calculate scrollbar width on mount */
  :global(:root) {
    --scrollbar-width: 0px;
  }
</style>