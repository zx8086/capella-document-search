<!-- src/lib/components/ChatbotPopup.svelte -->

<script lang="ts">
  import { page } from '$app/stores';
  import { Button } from "$lib/components/ui/button";
  import { browser } from "$app/environment";
  import { getContext, onMount, createEventDispatcher, onDestroy } from "svelte";
  import { key } from "$lib/context/tracker";
  import { trackEvent, waitForTracker, isTrackerReady } from "$lib/context/tracker";
  import { userAccount, isAuthenticated } from '$lib/stores/authStore';
  import { userPhotoUrl, fetchUserPhoto, ensureUserPhoto } from '$lib/stores/photoStore';
  import { chatStore, formatMessagesForDisplay, type Conversation } from '$lib/stores/chatStore';
  import { getMsalInstance } from '$lib/config/authConfig';
  import { marked } from 'marked';
  import hljs from 'highlight.js/lib/core';
  import 'highlight.js/styles/github-dark.css';
  
  // Import specific language support for highlight.js
  import sql from 'highlight.js/lib/languages/sql';
  import javascript from 'highlight.js/lib/languages/javascript';
  import json from 'highlight.js/lib/languages/json';
  import bash from 'highlight.js/lib/languages/bash';
  import python from 'highlight.js/lib/languages/python';
  import java from 'highlight.js/lib/languages/java';
  import yaml from 'highlight.js/lib/languages/yaml';
  
  // Register languages
  hljs.registerLanguage('sql', sql);
  hljs.registerLanguage('javascript', javascript);
  hljs.registerLanguage('json', json);
  hljs.registerLanguage('bash', bash);
  hljs.registerLanguage('python', python);
  hljs.registerLanguage('java', java);
  hljs.registerLanguage('yaml', yaml);
  
  // Configure marked with highlight.js
  marked.setOptions({
    highlight: function(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch (err) {
          // Fall back to plain text
        }
      }
      return hljs.highlightAuto(code).value;
    },
    breaks: true,
    gfm: true
  });
  
  // Function to copy text to clipboard
  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      // Show brief success feedback (could be enhanced with a toast)
      console.log('Code copied to clipboard');
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  }

  // Function to render markdown to HTML with copy buttons
  function renderMarkdown(text: string): string {
    try {
      let html = marked.parse(text);
      
      // Add copy buttons to code blocks
      html = html.replace(
        /<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/g,
        (match, codeContent) => {
          // Generate unique ID for this code block
          const codeId = 'code-' + Math.random().toString(36).substr(2, 9);
          
          return `
            <div class="code-block-wrapper relative overflow-x-auto">
              <button 
                class="copy-btn absolute top-2 right-2 bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded opacity-75 hover:opacity-100 transition-opacity duration-200 z-10"
                data-code-id="${codeId}"
                title="Copy code"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.75.694-1.75 1.542 0 .847.72 1.542 1.75 1.542h3A2.25 2.25 0 0 1 15.666 3.888zM8.25 4.5c0-.78.637-1.417 1.417-1.417h.666c.78 0 1.417.637 1.417 1.417v.583c0 .78-.637 1.417-1.417-1.417h-.666c-.78 0-1.417-.637-1.417-1.417V4.5z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m-7.5-3v5.25A2.25 2.25 0 0 0 6.75 22.5h7.5a2.25 2.25 0 0 0 2.25-2.25V13.5a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25z" />
                </svg>
              </button>
              <pre id="${codeId}" class="code-content overflow-x-auto whitespace-pre min-w-full"><code>${codeContent}</code></pre>
            </div>
          `;
        }
      );
      
      return html;
    } catch (error) {
      console.warn('Failed to parse markdown:', error);
      return text; // Fall back to plain text
    }
  }

  // Function to handle copy button clicks using event delegation
  function handleCopyClick(event: Event) {
    const button = event.target as HTMLElement;
    const copyBtn = button.closest('.copy-btn') as HTMLElement;
    
    if (copyBtn) {
      const codeId = copyBtn.dataset.codeId;
      if (codeId) {
        const codeElement = document.getElementById(codeId);
        if (codeElement) {
          const codeText = codeElement.textContent || '';
          copyToClipboard(codeText);
          
          // Visual feedback - briefly change button icon
          const originalContent = copyBtn.innerHTML;
          copyBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-3 h-3">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          `;
          setTimeout(() => {
            copyBtn.innerHTML = originalContent;
          }, 2000);
        }
      }
    }
  }

  // Setup event delegation for copy buttons
  function setupCopyFunction() {
    if (browser && messagesContainer) {
      // Remove any existing listener
      messagesContainer.removeEventListener('click', handleCopyClick);
      // Add event delegation for copy buttons
      messagesContainer.addEventListener('click', handleCopyClick);
    }
  }
  
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
  let conversation = $state<Conversation | null>(null);
  
  // Use derived with safe access to avoid initialization issues
  let messages = $derived(formatMessagesForDisplay(conversation));
  let conversationSummary = $derived(conversation ? chatStore.getConversationSummary() : null);
  
  // Get first name from full name
  function getFirstName(fullName: string = ''): string {
    return fullName.split(' ')[0] || 'there';
  }
  
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
      setTimeout(() => {
        scrollToBottom();
        setupCopyFunction(); // Setup copy buttons after DOM updates
      }, 100); // Small delay to ensure content is rendered
    }
  });

  // Enhanced scroll function that ensures we see the latest content
  function forceScrollToBottom() {
    if (messagesContainer) {
      // Force scroll with multiple attempts to handle dynamic content height
      requestAnimationFrame(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        // Additional scroll attempt after content renders
        setTimeout(() => {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 50);
      });
    }
  }
  
  $effect(() => {
    console.debug('🤖 Chat Assistant Visibility Check:', {
      trackerReady,
      timestamp: new Date().toISOString()
    });
  });
  
  // Subscribe to chat store changes and update local conversation state
  $effect(() => {
    const unsubscribe = chatStore.subscribe(conv => {
      conversation = conv;
    });
    
    return () => unsubscribe();
  });

  onMount(async () => {
    try {
      // Wait for tracker to be ready
      while (!isTrackerReady()) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      trackerReady = true;
      isInitialized = true;
      
      console.debug('🤖 Chat Assistant Init:', {
        trackerReady,
        pathname: $page?.url?.pathname,
        isAuthenticated: $isAuthenticated,
        timestamp: new Date().toISOString()
      });

      // Initialize chat store
      chatStore.initialize($userAccount?.name);

      // Fetch user photo if authenticated
      if ($isAuthenticated && $userAccount) {
        const msalInstance = await getMsalInstance();
        if (msalInstance) {
          try {
            const tokenResponse = await msalInstance.acquireTokenSilent({
              scopes: ['User.Read', 'User.ReadBasic.All', 'user.read.all', 'user.read']
            });
            
            await ensureUserPhoto(tokenResponse.accessToken, $userAccount.localAccountId);
            
          } catch (error) {
            console.warn('Failed to fetch user photo:', error);
          }
        }
      }

    } catch (error) {
      console.warn('🤖 Chat Assistant: Initialization failed', error);
      trackerReady = true;
      isInitialized = true;
    }
  });
  
  function toggleChat() {
    dispatch('toggle');
    
    if (browser && trackerReady) {
      trackEvent("User_Interaction", {
        type: "click",
        element: "ChatAssistant",
        action: !isOpen ? "OpenChat" : "CloseChat",
        page: "Document Search"
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
        // Add user message to conversation
        chatStore.addMessage('user', userMessage);
        
        // Add loading assistant message
        const loadingMessageId = chatStore.addMessage('assistant', '', true);

        const sessionStartTime = new Date().toISOString();
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                messages: chatStore.getMessagesForAPI(),
                user: $userAccount ? {
                    id: $userAccount.localAccountId || $userAccount.homeAccountId,
                    name: $userAccount.name,
                    username: $userAccount.username,
                    email: $userAccount.username,  // Usually contains email
                    tenantId: $userAccount.tenantId,
                    environment: $userAccount.environment,
                    isAuthenticated: $isAuthenticated,
                    // Add session/interaction context
                    sessionStartTime: sessionStartTime,
                    messageCount: messages.length,
                    clientTimestamp: new Date().toISOString(),
                    pathname: $page?.url?.pathname,
                    conversationId: conversation?.id
                } : null
            })
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
                                chatStore.updateMessage(loadingMessageId, accumulatedResponse, false);
                                // Force scroll on content updates to ensure visibility
                                forceScrollToBottom();
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
                        chatStore.updateMessage(loadingMessageId, accumulatedResponse, false);
                    }
                } catch (e) {
                    console.warn('⚠️ Failed to parse final buffer:', buffer, e);
                }
            }
            
            // Ensure final message state is set
            chatStore.updateMessage(loadingMessageId, accumulatedResponse, false);
            
            // Final scroll to ensure all content is visible
            setTimeout(() => forceScrollToBottom(), 200);
            
        } catch (error) {
            console.error('❌ Stream processing error:', error);
            throw error; // Re-throw to be handled by outer catch block
        } finally {
            console.log('🧹 Cleaning up stream resources');
            reader.releaseLock();
        }

    } catch (error) {
        console.error('❌ Chat error:', error);
        chatStore.updateMessage(loadingMessageId, 'I apologize, but I encountered an error processing your request. Please try again.', false);
    } finally {
        isLoading = false;
    }
  }


  function startNewConversation() {
    if (browser && trackerReady) {
      trackEvent("User_Interaction", {
        type: "click",
        element: "ChatAssistant",
        action: "ClearConversation",
        page: "Document Search"
      });
    }
    
    chatStore.startNewConversation($userAccount?.name);
  }

  $effect(() => {
    console.debug('🤖 Chat Assistant Status Changed:', {
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
        pathname: $page?.url?.pathname,
        isAuthenticated: $isAuthenticated,
        timestamp: new Date().toISOString()
    });
  });
</script>

{#if $page.url.pathname !== '/login' && $isAuthenticated}
  <div 
    class="fixed bottom-4 left-4 z-50 flex flex-col items-start space-y-4"
    class:chat-open={isOpen}
  >
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
        <div class="flex flex-col h-[80vh] max-h-[800px] min-h-[500px]">
          <!-- Header -->
          <div class="flex items-center justify-between border-b border-gray-200 bg-[#00174f] p-4 dark:border-gray-800">
            <div class="flex items-center gap-2">
              <h2 class="font-bold text-white">Chat Assistant</h2>
              {#if conversationSummary?.hasContext}
                <span class="text-xs text-gray-300 bg-gray-600 px-2 py-1 rounded">
                  {conversationSummary.messageCount} messages
                </span>
              {/if}
            </div>
            <div class="flex items-center gap-2">
              {#if conversationSummary?.hasContext}
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onclick={startNewConversation}
                  class="text-white hover:bg-gray-600 transition-colors duration-200"
                  aria-label="Clear conversation and start new"
                  title="Clear conversation and start new"
                  data-transaction-name="Chat Assistant Clear"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </Button>
              {/if}
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
          </div>

          <!-- Messages -->
          <div 
            bind:this={messagesContainer}
            class="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
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
                    <div class="prose prose-sm max-w-none dark:prose-invert prose-pre:bg-gray-900 prose-pre:text-gray-100 overflow-x-auto">
                      {#if message.type === 'bot'}
                        {#if message.text.includes('References:')}
                          {@html renderMarkdown(message.text.split('References:')[0])}
                          <div class="mt-2 text-sm text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-2">
                            References:
                            {#each message.text.split('References:')[1].trim().split('\n').filter(ref => ref.trim()) as ref}
                              <div class="break-all">- {ref.trim()}</div>
                            {/each}
                          </div>
                        {:else}
                          {@html renderMarkdown(message.text)}
                        {/if}
                      {:else}
                        <div class="whitespace-pre-wrap break-words">{message.text}</div>
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
                placeholder={isLoading ? "Please wait..." : chatStore.isNearContextLimit() ? "Approaching context limit - consider clearing conversation..." : "Type your Couchbase Capella related question here..."}
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
  </div>
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

  /* Custom markdown styling for chat messages */
  :global(.prose) {
    color: inherit !important;
  }
  
  :global(.prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6) {
    color: inherit !important;
    margin-top: 1rem !important;
    margin-bottom: 0.5rem !important;
  }
  
  :global(.prose p) {
    margin-top: 0.5rem !important;
    margin-bottom: 0.5rem !important;
  }
  
  :global(.prose ul, .prose ol) {
    margin-top: 0.5rem !important;
    margin-bottom: 0.5rem !important;
  }
  
  :global(.prose li) {
    margin-top: 0.25rem !important;
    margin-bottom: 0.25rem !important;
  }
  
  :global(.code-block-wrapper) {
    position: relative !important;
    margin: 0.5rem 0 !important;
    overflow-x: auto !important;
    max-width: 100% !important;
  }
  
  :global(.prose pre) {
    background-color: #1f2937 !important;
    color: #f9fafb !important;
    border-radius: 0.375rem !important;
    padding: 1rem !important;
    padding-top: 2.5rem !important; /* Make room for copy button */
    margin: 0 !important;
    overflow-x: auto !important;
    white-space: pre !important;
    word-wrap: normal !important;
    min-width: max-content !important;
  }
  
  /* Improve styling for long lines in tool responses */
  :global(.prose code:not(pre code)) {
    white-space: nowrap !important;
    word-break: break-all !important;
  }
  
  /* Handle long lines in regular text */
  :global(.prose p) {
    overflow-wrap: break-word !important;
    word-break: break-word !important;
  }
  
  /* Better handling for numbered lists with long text */
  :global(.prose ol li) {
    overflow-wrap: break-word !important;
    word-break: break-word !important;
  }
  
  /* Ensure container allows horizontal scrolling */
  :global(.prose) {
    overflow-x: auto !important;
    max-width: 100% !important;
  }
  
  /* Ensure very long content is properly contained */
  :global(.prose h1, .prose h2, .prose h3, .prose h4, .prose h5, .prose h6) {
    word-break: break-word !important;
  }
  
  /* Custom styling for better long content display */
  .scroll-smooth {
    scroll-behavior: smooth;
  }
  
  :global(.copy-btn) {
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    border: none !important;
    cursor: pointer !important;
    transition: all 0.2s ease !important;
  }
  
  :global(.copy-btn:hover) {
    transform: scale(1.05) !important;
  }
  
  :global(.prose code) {
    background-color: #f3f4f6 !important;
    color: #374151 !important;
    padding: 0.125rem 0.25rem !important;
    border-radius: 0.25rem !important;
    font-size: 0.875em !important;
  }
  
  :global(.prose pre code) {
    background-color: transparent !important;
    color: inherit !important;
    padding: 0 !important;
  }
  
  :global(.prose strong) {
    font-weight: 600 !important;
    color: inherit !important;
  }
  
  :global(.prose blockquote) {
    border-left: 4px solid #d1d5db !important;
    padding-left: 1rem !important;
    font-style: italic !important;
    margin: 0.5rem 0 !important;
  }
</style>