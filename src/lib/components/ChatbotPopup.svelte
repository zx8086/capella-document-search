<script lang="ts">
  import { page } from '$app/stores';
  import { Button } from "$lib/components/ui/button";
  import { browser } from "$app/environment";
  import { getContext, onMount, createEventDispatcher, onDestroy } from "svelte";
  import { key } from "$lib/context/tracker";
  import { getFeatureFlag, trackEvent, waitForTracker, isTrackerReady } from "$lib/context/tracker";
  import { userAccount, isAuthenticated } from '$lib/stores/authStore';
  import { userPhotoUrl, fetchUserPhoto } from '$lib/stores/photoStore';
  import { getMsalInstance } from '$lib/config/authConfig';
  import { getFlag } from '$lib/stores/featureFlagStore';
  
  const dispatch = createEventDispatcher();
  
  interface Props {
    isOpen?: boolean;
  }
  
  const { isOpen = false } = $props<Props>();
  let isLoading = $state(false);
  let newMessage = $state('');
  let userPhoto = $state($userPhotoUrl);
  let trackerReady = $state(false);
  let isInitialized = $state(false);
  
  // Initialize with the flag value from store
  let isFeatureEnabled = $state(getFlag('rag-chat-assistant'));
  
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
  
  $effect(() => {
    console.debug('🤖 Chat Assistant Visibility Check:', {
      flagValue: getFlag('rag-chat-assistant'),
      isEnabled: isFeatureEnabled,
      trackerReady,
      timestamp: new Date().toISOString()
    });
    
    // Update isFeatureEnabled based on flag value
    isFeatureEnabled = getFlag('rag-chat-assistant');
  });
  
  onMount(async () => {
    try {
      // Wait for tracker to be ready
      while (!isTrackerReady()) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      trackerReady = true;
      isInitialized = true;
      
      // Update feature flag after tracker is ready
      isFeatureEnabled = getFlag('rag-chat-assistant');
      
      console.debug('🤖 Chat Assistant Init:', {
        trackerReady,
        isFeatureEnabled,
        pathname: $page?.url?.pathname,
        isAuthenticated: $isAuthenticated,
        timestamp: new Date().toISOString()
      });

      // Fetch user photo if authenticated
      if ($isAuthenticated && $userAccount) {
        console.log('👤 Attempting to fetch user photo...', {
          userId: $userAccount.localAccountId,
          timestamp: new Date().toISOString()
        });
        
        const msalInstance = await getMsalInstance();
        if (msalInstance) {
          try {
            const tokenResponse = await msalInstance.acquireTokenSilent({
              scopes: [
                  'User.Read',
                  'User.ReadBasic.All',
                  'user.read.all',
                  'user.read'
              ]
            });
            
            console.log('🎫 Token acquired for photo fetch:', {
              success: !!tokenResponse.accessToken,
              timestamp: new Date().toISOString()
            });
            
            const photoUrl = await fetchUserPhoto(
              tokenResponse.accessToken, 
              $userAccount.localAccountId
            );
            
            console.log('📸 User photo fetch result:', {
              success: !!photoUrl,
              isDefault: photoUrl === '/default-avatar.png',
              timestamp: new Date().toISOString()
            });
            
          } catch (error) {
            console.warn('❌ Failed to fetch user photo:', {
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: new Date().toISOString()
            });
          }
        }
      }

    } catch (error) {
      console.warn('🤖 Chat Assistant: Initialization failed', error);
      trackerReady = true;
      isInitialized = true;
      isFeatureEnabled = true; // Keep chat enabled if initialization fails
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

  // Add effect to monitor visibility conditions
  $effect(() => {
    console.debug('🤖 Chat Assistant Visibility:', {
        isInitialized,
        isFeatureEnabled,
        pathname: $page?.url?.pathname,
        isAuthenticated: $isAuthenticated,
        timestamp: new Date().toISOString()
    });
  });
</script>

{#if isFeatureEnabled && isInitialized}
  <button
    type="button"
    onclick={toggleChat}
    class="fixed bottom-24 right-6 z-[45] rounded-full bg-[#00174f] p-4 text-white shadow-lg hover:bg-[#00174f]/90 hover:ring-2 hover:ring-red-500 hover:ring-offset-2 transition-all duration-300"
    aria-label="Toggle chat"
    data-transaction-name="Chat Assistant Toggle"
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
      data-transaction-name="Chat Assistant Close"
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
          <h2 class="font-bold text-white">Chat Assistant</h2>
          <Button 
            variant="ghost" 
            size="icon" 
            onclick={toggleChat} 
            class="text-white hover:bg-transparent hover:text-red-500 transition-colors duration-200"
            aria-label="Close chat"
            data-transaction-name="Chat Assistant Close"
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
            <div class="flex {message.type === 'user' ? 'justify-end' : 'justify-start'} items-start gap-2">
              {#if message.type === 'bot'}
                <div class="w-8 h-8 rounded-full bg-[#00174f] flex-shrink-0 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 text-white">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                  </svg>
                </div>
              {/if}
              <div class="rounded-lg px-4 py-2 max-w-[80%] {message.type === 'user' ? 'bg-[#00174f] text-white' : 'bg-gray-100 dark:bg-gray-800'}">
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
              {#if message.type === 'user'}
                <img 
                  src={userPhoto} 
                  alt="User" 
                  class="w-8 h-8 rounded-full object-cover flex-shrink-0"
                />
              {/if}
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
              placeholder={isLoading ? "Please wait..." : "Type your Couchbase Capella related question here..."}
              disabled={isLoading}
              class="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring focus:ring-tommy-red/50 dark:border-gray-700 bg-white text-black dark:bg-white dark:text-black disabled:opacity-50"
              aria-label="Message input"
            />
            <Button 
              type="submit" 
              class="bg-[#00174f] hover:bg-[#00174f]/90 hover:ring-2 hover:ring-red-500 hover:ring-offset-2 transition-all duration-300 disabled:opacity-50"
              disabled={isLoading}
              aria-label="Send message"
              data-transaction-name="Send Chat Query"
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