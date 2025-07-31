<!-- src/lib/components/ChatbotPopup.svelte -->

<script lang="ts">
    import { page } from "$app/stores";
    import { Button } from "$lib/components/ui/button";
    import { browser } from "$app/environment";
    import {
        getContext,
        onMount,
        createEventDispatcher,
        onDestroy,
    } from "svelte";
    import { key } from "$lib/context/tracker";
    import {
        trackEvent,
        waitForTracker,
        isTrackerReady,
    } from "$lib/context/tracker";
    import { userAccount, isAuthenticated } from "$lib/stores/authStore";
    import {
        userPhotoUrl,
        fetchUserPhoto,
        ensureUserPhoto,
    } from "$lib/stores/photoStore";
    import {
        chatStore,
        formatMessagesForDisplay,
        type Conversation,
    } from "$lib/stores/chatStore";
    import { getMsalInstance } from "$lib/config/authConfig";
    import { marked } from "marked";
    import ThinkingSection from "./ThinkingSection.svelte";
    import ChatProgressIndicator from "./ChatProgressIndicator.svelte";
    import SuggestedQueries from "./SuggestedQueries.svelte";
    import hljs from "highlight.js/lib/core";
    import "highlight.js/styles/github-dark.css";

    // Timeout configurations (with defaults matching backend)
    const CHAT_REQUEST_TIMEOUT = import.meta.env.CHAT_REQUEST_TIMEOUT
        ? parseInt(import.meta.env.CHAT_REQUEST_TIMEOUT)
        : 300000; // 5 minutes
    const CHAT_FAILSAFE_TIMEOUT = import.meta.env.CHAT_FAILSAFE_TIMEOUT
        ? parseInt(import.meta.env.CHAT_FAILSAFE_TIMEOUT)
        : 270000; // 4.5 minutes
    const CHAT_STUCK_CHECK_TIMEOUT = import.meta.env.CHAT_STUCK_CHECK_TIMEOUT
        ? parseInt(import.meta.env.CHAT_STUCK_CHECK_TIMEOUT)
        : 240000; // 4 minutes
    const STUCK_CHECK_INTERVAL = 5000; // Check every 5 seconds

    // Import specific language support for highlight.js
    import sql from "highlight.js/lib/languages/sql";
    import javascript from "highlight.js/lib/languages/javascript";
    import json from "highlight.js/lib/languages/json";
    import bash from "highlight.js/lib/languages/bash";
    import python from "highlight.js/lib/languages/python";
    import java from "highlight.js/lib/languages/java";
    import yaml from "highlight.js/lib/languages/yaml";

    // Register languages
    hljs.registerLanguage("sql", sql);
    hljs.registerLanguage("javascript", javascript);
    hljs.registerLanguage("json", json);
    hljs.registerLanguage("bash", bash);
    hljs.registerLanguage("python", python);
    hljs.registerLanguage("java", java);
    hljs.registerLanguage("yaml", yaml);

    // Configure marked with highlight.js
    marked.setOptions({
        highlight: function (code, lang) {
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
        gfm: true,
    });

    // Function to extract thinking content and clean response
    function extractThinkingContent(text: string): {
        thinking: string;
        cleanedText: string;
    } {
        const thinkingRegex = /<thinking>([\s\S]*?)<\/thinking>/g;
        let thinking = "";
        let cleanedText = text;

        // Extract thinking content
        let match;
        while ((match = thinkingRegex.exec(text)) !== null) {
            thinking += match[1].trim();
            if (thinking && !thinking.endsWith("\n")) {
                thinking += "\n\n";
            }
        }

        // Check for tool execution markers
        if (text.includes("[Executing tools...]")) {
            if (thinking) thinking += "\n\n";
            thinking += "Executing tools to get live system data...";
        }

        // Remove thinking tags and tool execution markers from the main response
        cleanedText = text
            .replace(/<thinking>[\s\S]*?<\/thinking>/g, "")
            .replace(/\[Executing tools\.\.\.\]/g, "")
            // Also remove incomplete thinking tags during streaming
            .replace(/<thinking>[\s\S]*$/g, "")
            .trim();

        return { thinking: thinking.trim(), cleanedText };
    }

    // Function to copy text to clipboard
    async function copyToClipboard(text: string) {
        try {
            await navigator.clipboard.writeText(text);
            // Show brief success feedback (could be enhanced with a toast)
            console.log("Code copied to clipboard");
        } catch (err) {
            console.error("Failed to copy to clipboard:", err);
            // Fallback for older browsers
            const textArea = document.createElement("textarea");
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand("copy");
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
                    const codeId =
                        "code-" + Math.random().toString(36).substr(2, 9);

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
                },
            );

            return html;
        } catch (error) {
            console.warn("Failed to parse markdown:", error);
            return text; // Fall back to plain text
        }
    }

    // Function to handle copy button clicks using event delegation
    function handleCopyClick(event: Event) {
        const button = event.target as HTMLElement;
        const copyBtn = button.closest(".copy-btn") as HTMLElement;

        if (copyBtn) {
            const codeId = copyBtn.dataset.codeId;
            if (codeId) {
                const codeElement = document.getElementById(codeId);
                if (codeElement) {
                    const codeText = codeElement.textContent || "";
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
            messagesContainer.removeEventListener("click", handleCopyClick);
            // Add event delegation for copy buttons
            messagesContainer.addEventListener("click", handleCopyClick);
        }
    }

    const dispatch = createEventDispatcher();

    interface Props {
        isOpen?: boolean;
    }

    const { isOpen = false } = $props<Props>();

    // Request state machine
    type RequestState =
        | "idle"
        | "initializing"
        | "thinking"
        | "streaming"
        | "aborting"
        | "error";
    let requestState = $state<RequestState>("idle");
    let requestId = $state<string | null>(null);

    // Helper function to update request state with logging
    function setRequestState(newState: RequestState) {
        const oldState = requestState;
        requestState = newState;
        console.log(`📊 [Request State] ${oldState} → ${newState}`);
    }

    // Derived loading state from request state
    let isLoading = $derived(requestState !== "idle");
    let canSubmit = $derived(requestState === "idle");
    let canAbort = $derived(
        requestState === "initializing" ||
            requestState === "thinking" ||
            requestState === "streaming",
    );

    let newMessage = $state("");
    let userPhoto = $state($userPhotoUrl);
    let trackerReady = $state(false);
    let isInitialized = $state(false);
    let conversation = $state<Conversation | null>(null);
    let currentThinking = $state("");
    let isThinking = $derived(
        requestState === "thinking" || requestState === "initializing",
    );
    let abortController = $state<AbortController | null>(null);
    let currentLoadingMessageId = $state<string | null>(null);

    // Progress tracking
    let progressMessage = $state("");
    let progressDetails = $state("");
    let showProgress = $state(false);
    let currentTokenUsage = $state<{
        input: number;
        output: number;
        total: number;
    } | null>(null);
    let currentEstimatedCost = $state<number | null>(null);

    // Track thinking content per message
    let messageThinking = $state<Map<string, string>>(new Map());
    // Track which messages used extended thinking
    let extendedThinkingMessages = $state<Set<string>>(new Set());
    let enableExtendedThinking = $state(false);
    
    // Track if we should show suggested queries
    let showSuggestedQueries = $derived(
        messages.length <= 1 && // Only greeting message
        requestState === "idle" && // Not loading
        !newMessage.trim() // No text in input
    );

    // Use derived with safe access to avoid initialization issues
    let messages = $derived(formatMessagesForDisplay(conversation));
    let conversationSummary = $derived(
        conversation ? chatStore.getConversationSummary() : null,
    );

    // Derive placeholder reactively to fix clear conversation issue
    const MAX_CONTEXT_THRESHOLD = 16; // 80% of 20 messages limit
    let inputPlaceholder = $derived(
        isLoading
            ? "Please wait..."
            : conversation &&
                conversation.messages.filter((msg) => !msg.isLoading).length >
                    MAX_CONTEXT_THRESHOLD
              ? "Approaching context limit - consider clearing conversation..."
              : "Type your Couchbase Capella related question here...",
    );

    // Derive button disabled state for better reactivity
    let isButtonDisabled = $derived(canAbort ? false : !newMessage.trim());

    // Track progress indicator visibility state
    let progressIndicatorActive = $derived(
        showProgress && isLoading && !isThinking,
    );

    // Log when progress indicator visibility changes
    let previousProgressState = $state(false);
    let previousShowProgress = $state(false);

    $effect(() => {
        const isActive = progressIndicatorActive;

        // Log showProgress changes
        if (showProgress !== previousShowProgress) {
            console.log(
                `📌 [Progress Control] showProgress changed: ${previousShowProgress} → ${showProgress}`,
            );
            previousShowProgress = showProgress;
        }

        // Log overall visibility changes
        if (isActive !== previousProgressState) {
            if (isActive) {
                console.log(
                    "🎯 [Progress Indicator State] VISIBLE - Conditions met:",
                    {
                        showProgress,
                        isLoading,
                        isThinking,
                        requestState,
                        combined: isActive,
                        timestamp: new Date().toISOString(),
                    },
                );
            } else {
                console.log(
                    "🎯 [Progress Indicator State] HIDDEN - Conditions changed:",
                    {
                        showProgress,
                        isLoading,
                        isThinking,
                        requestState,
                        combined: isActive,
                        timestamp: new Date().toISOString(),
                    },
                );
            }
            previousProgressState = isActive;
        }
    });

    // Get first name from full name
    function getFirstName(fullName: string = ""): string {
        return fullName.split(" ")[0] || "there";
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
                    messagesContainer.scrollTop =
                        messagesContainer.scrollHeight;
                }, 50);
            });
        }
    }

    $effect(() => {
        console.debug("🤖 Chat Assistant Visibility Check:", {
            trackerReady,
            timestamp: new Date().toISOString(),
        });
    });

    // Subscribe to chat store changes and update local conversation state
    $effect(() => {
        const unsubscribe = chatStore.subscribe((conv) => {
            conversation = conv;
        });

        return () => unsubscribe();
    });

    onMount(async () => {
        try {
            // Wait for tracker to be ready
            while (!isTrackerReady()) {
                await new Promise((resolve) => setTimeout(resolve, 100));
            }
            trackerReady = true;
            isInitialized = true;

            console.debug("🤖 Chat Assistant Init:", {
                trackerReady,
                pathname: $page?.url?.pathname,
                isAuthenticated: $isAuthenticated,
                timestamp: new Date().toISOString(),
            });

            // Initialize chat store
            chatStore.initialize($userAccount?.name);

            // Set up periodic check for stuck loading states
            const stuckCheckInterval = setInterval(() => {
                if (messages.length > 0) {
                    const stuckMessages = messages.filter(
                        (m) =>
                            m.isLoading &&
                            m.timestamp &&
                            Date.now() - new Date(m.timestamp).getTime() >
                                CHAT_STUCK_CHECK_TIMEOUT,
                    );

                    if (stuckMessages.length > 0) {
                        console.warn(
                            "⚠️ Detected stuck loading messages:",
                            stuckMessages.length,
                            "after",
                            CHAT_STUCK_CHECK_TIMEOUT / 1000,
                            "seconds",
                        );
                        stuckMessages.forEach((msg) => {
                            console.log(
                                "🔧 Force-clearing stuck message:",
                                msg.id,
                            );
                            chatStore.updateMessage(
                                msg.id,
                                msg.content ||
                                    "Request timed out. The query took longer than expected. Please try a more specific query or break it into smaller parts.",
                                false,
                            );
                        });

                        // Force clear thinking state
                        if (
                            requestState === "thinking" ||
                            requestState === "streaming" ||
                            currentLoadingMessageId
                        ) {
                            currentThinking = "";
                            setRequestState("idle");
                            requestId = null;
                            currentLoadingMessageId = null;
                        }
                    }
                }
            }, STUCK_CHECK_INTERVAL);

            // Store interval ID for cleanup
            window.__stuckCheckInterval = stuckCheckInterval;

            // Fetch user photo if authenticated
            if ($isAuthenticated && $userAccount) {
                const msalInstance = await getMsalInstance();
                if (msalInstance) {
                    try {
                        const tokenResponse =
                            await msalInstance.acquireTokenSilent({
                                scopes: [
                                    "User.Read",
                                    "User.ReadBasic.All",
                                    "user.read.all",
                                    "user.read",
                                ],
                            });

                        await ensureUserPhoto(
                            tokenResponse.accessToken,
                            $userAccount.localAccountId,
                        );
                    } catch (error) {
                        console.warn("Failed to fetch user photo:", error);
                    }
                }
            }
        } catch (error) {
            console.warn("🤖 Chat Assistant: Initialization failed", error);
            trackerReady = true;
            isInitialized = true;
        }
    });

    function toggleChat() {
        dispatch("toggle");

        if (browser && trackerReady) {
            trackEvent("User_Interaction", {
                type: "click",
                element: "ChatAssistant",
                action: !isOpen ? "OpenChat" : "CloseChat",
                page: "Document Search",
            });
        }
    }

    // Add cleanup on component destruction
    onDestroy(() => {
        if (browser) {
            // Ensure body overflow is restored when component is destroyed
            document.body.style.overflow = "";
        }
        // Clean up any pending request
        if (abortController) {
            abortController.abort();
        }
    });

    function handleAbort() {
        console.log(
            "🛑 handleAbort called, requestState:",
            requestState,
            "abortController:",
            !!abortController,
            "loadingMessageId:",
            currentLoadingMessageId,
        );

        if (!canAbort) {
            console.log("⚠️ Cannot abort in current state:", requestState);
            return;
        }

        // Update state to aborting
        setRequestState("aborting");

        if (abortController) {
            console.log("🛑 User requested to abort chat request");
            abortController.abort();
            abortController = null;

            // Use the stored loading message ID
            if (currentLoadingMessageId) {
                chatStore.updateMessage(
                    currentLoadingMessageId,
                    "Request was cancelled by user.",
                    false,
                );
                console.log("✅ Updated message with cancellation notice");
                currentLoadingMessageId = null;
            } else {
                console.log("⚠️ No loading message ID stored");
            }

            // Clear progress
            progressMessage = "";
            progressDetails = "";
            showProgress = false;
            console.log(
                "🔴 [Progress Indicator] DISABLED - clearProgress() called",
            );
            currentTokenUsage = null;
            currentEstimatedCost = null;
        } else {
            console.log("⚠️ No abortController to abort");
        }

        // Reset to idle state
        setRequestState("idle");
        requestId = null;
    }

    async function handleSubmit() {
        // Prevent submission if not in idle state or no message
        if (!canSubmit || !newMessage.trim()) {
            console.log("⚠️ Prevented submission:", {
                requestState,
                canSubmit,
                hasMessage: !!newMessage.trim(),
            });
            return;
        }

        const userMessage = newMessage.trim();
        newMessage = "";

        // Generate unique request ID
        requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log("🆔 Starting new request:", requestId);

        // Update state machine
        setRequestState("initializing");
        currentThinking = `Analyzing your question: "${userMessage}"\n\nProcessing context and searching relevant information...`;

        // Initialize progress tracking
        progressMessage = "Initializing request...";
        progressDetails = "Connecting to AI services";
        showProgress = true;
        console.log(
            "🟢 [Progress Indicator] ENABLED - Starting request processing",
        );

        // Create new AbortController for this request
        abortController = new AbortController();

        // Set up timeout matching backend timeout
        const timeoutId = setTimeout(() => {
            if (abortController) {
                console.log(
                    `⏰ Chat request timed out after ${CHAT_REQUEST_TIMEOUT / 1000} seconds`,
                );
                abortController.abort("timeout");
            }
        }, CHAT_REQUEST_TIMEOUT);

        // Set up failsafe timeout to ensure thinking state is cleared (slightly before main timeout)
        const failsafeTimeoutId = setTimeout(() => {
            console.log(
                `⏰ Failsafe timeout triggered after ${CHAT_FAILSAFE_TIMEOUT / 1000} seconds - clearing thinking state`,
            );
            if (
                (requestState === "thinking" || requestState === "streaming") &&
                currentLoadingMessageId
            ) {
                // Force clear the loading state
                chatStore.updateMessage(
                    currentLoadingMessageId,
                    "Request is taking longer than expected. The response may be truncated.",
                    false,
                );
                currentThinking = "";
                setRequestState("idle");
                requestId = null;
            }
        }, CHAT_FAILSAFE_TIMEOUT);

        try {
            // Add user message to conversation
            chatStore.addMessage("user", userMessage);

            // Add loading assistant message
            const loadingMessageId = chatStore.addMessage(
                "assistant",
                "",
                true,
            );
            currentLoadingMessageId = loadingMessageId;
            console.log(
                "💬 Created loading message with ID:",
                loadingMessageId,
            );

            // Track if this message uses extended thinking
            if (enableExtendedThinking) {
                extendedThinkingMessages.add(loadingMessageId);
            }

            // Transition to thinking state
            setRequestState("thinking");
            progressMessage = "AI is processing your request...";
            progressDetails = "Analyzing context and formulating response";

            const sessionStartTime = new Date().toISOString();
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                signal: abortController.signal,
                body: JSON.stringify({
                    messages: chatStore.getMessagesForAPI(),
                    user: $userAccount
                        ? {
                              id:
                                  $userAccount.localAccountId ||
                                  $userAccount.homeAccountId,
                              name: $userAccount.name,
                              username: $userAccount.username,
                              email: $userAccount.username, // Usually contains email
                              tenantId: $userAccount.tenantId,
                              environment: $userAccount.environment,
                              isAuthenticated: $isAuthenticated,
                              // Add session/interaction context
                              sessionStartTime: sessionStartTime,
                              messageCount: messages.length,
                              clientTimestamp: new Date().toISOString(),
                              pathname: $page?.url?.pathname,
                              conversationId: conversation?.id,
                          }
                        : null,
                    enableExtendedThinking: enableExtendedThinking,
                }),
            });

            if (!response.ok) {
                // Try to parse error response if it's JSON
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    try {
                        const errorData = await response.json();
                        if (errorData.message) {
                            throw new Error(errorData.message);
                        }
                    } catch (parseError) {
                        // Fall through to generic error
                    }
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error("Response body reader is null");
            }

            let accumulatedResponse = "";
            let buffer = "";
            const decoder = new TextDecoder();
            let extractedThinking = "";
            let cleanedResponse = "";
            let cleanedText = "";
            let firstContentReceived = false;

            console.log("🔄 Starting stream processing");

            // Transition to streaming state
            setRequestState("streaming");
            progressMessage = "Receiving response...";
            progressDetails = "Streaming AI response";

            try {
                let streamComplete = false;
                let readAttempts = 0;
                const maxReadAttempts = 3;

                while (!streamComplete) {
                    // Check if aborted before reading next chunk
                    if (!abortController || abortController.signal.aborted) {
                        console.log("🛑 Stream reading aborted");
                        streamComplete = true;
                        break;
                    }

                    console.log("📥 Reading next chunk...");
                    let result;

                    try {
                        result = await reader.read();
                        readAttempts = 0; // Reset attempts on successful read
                    } catch (readError) {
                        readAttempts++;
                        console.error(
                            `❌ Read error (attempt ${readAttempts}/${maxReadAttempts}):`,
                            readError,
                        );

                        if (readAttempts >= maxReadAttempts) {
                            throw new Error(
                                "Failed to read stream after multiple attempts",
                            );
                        }

                        // Wait briefly before retry
                        await new Promise((resolve) =>
                            setTimeout(resolve, 1000),
                        );
                        continue;
                    }

                    console.log("📦 Read result:", {
                        done: result.done,
                        hasValue: !!result.value,
                    });

                    // Check for stream completion before processing value
                    if (result.done) {
                        console.log("✅ Stream completed normally");
                        streamComplete = true;
                        break;
                    }

                    // Decode the current chunk and add it to the buffer
                    const newText = decoder.decode(result.value, {
                        stream: true,
                    });
                    console.log("📝 Decoded chunk:", newText);
                    buffer += newText;

                    // Process complete lines from the buffer
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || ""; // Keep the last incomplete line in the buffer

                    console.log("📊 Processing lines:", {
                        lineCount: lines.length,
                        remainingBuffer: buffer,
                    });

                    for (const line of lines) {
                        if (line.trim()) {
                            try {
                                const data = JSON.parse(line);
                                console.log("🔍 Parsed data:", data);

                                // Handle token usage updates
                                if (data.tokenUsage) {
                                    currentTokenUsage = data.tokenUsage;
                                    if (data.estimatedCost) {
                                        currentEstimatedCost =
                                            data.estimatedCost;
                                    }
                                    console.log("📊 Token usage update:", {
                                        tokens: data.tokenUsage,
                                        cost: data.estimatedCost,
                                    });
                                    continue; // Don't treat token updates as content
                                }

                                if (data.done) {
                                    console.log(
                                        "🏁 [Done Signal] Received done signal",
                                        {
                                            hasError: data.error,
                                            runId: data.runId,
                                            requestState,
                                            showProgress,
                                            isLoading,
                                            currentThinking: currentThinking
                                                ? "has content"
                                                : "empty",
                                        },
                                    );
                                    // Hide progress indicator now that we're truly done
                                    showProgress = false;
                                    console.log(
                                        "🔴 [Progress Indicator] DISABLED - Done signal received",
                                    );

                                    // Capture runId if provided in done message
                                    if (data.runId && !data.error) {
                                        console.log(
                                            "📝 Captured runId for feedback:",
                                            data.runId,
                                        );
                                        // Update the message with runId for feedback functionality
                                        chatStore.updateMessage(
                                            loadingMessageId,
                                            cleanedText || accumulatedResponse,
                                            false,
                                            data.runId,
                                        );
                                    } else {
                                        // Ensure loading state is cleared even on error
                                        chatStore.updateMessage(
                                            loadingMessageId,
                                            cleanedText || accumulatedResponse,
                                            false,
                                        );
                                    }
                                    // Transition to idle state on completion
                                    setRequestState("idle");
                                    requestId = null;
                                    streamComplete = true;
                                    break;
                                }

                                if (data.error) {
                                    console.error(
                                        "❌ Received error from server:",
                                        data.content,
                                    );
                                    const errorContent =
                                        data.content ||
                                        "An error occurred while processing your request.";
                                    // Format error with warning icon
                                    const formattedError = `⚠️ **Service Notice**\n\n${errorContent}`;
                                    chatStore.updateMessage(
                                        loadingMessageId,
                                        formattedError,
                                        false,
                                    );
                                    // Clear progress indicator on error
                                    showProgress = false;
                                    progressMessage = "";
                                    progressDetails = "";
                                    console.log(
                                        "🔴 [Progress Indicator] DISABLED - Error received",
                                    );
                                    streamComplete = true;
                                    break;
                                }

                                if (data.type === "progress") {
                                    // Handle progress updates
                                    console.log(
                                        "📈 Progress update:",
                                        data.message,
                                        data.details,
                                        {
                                            activeToolName: data.activeToolName,
                                            isExecutingTools:
                                                data.isExecutingTools,
                                            isWaitingForAI: data.isWaitingForAI,
                                        },
                                    );

                                    // Update progress state for the indicator
                                    progressMessage =
                                        data.message || progressMessage;
                                    progressDetails = data.details || "";

                                    // Always show progress when we receive progress updates
                                    showProgress = true;
                                    console.log(
                                        "📊 [Progress Indicator] VISIBLE - Progress update received",
                                    );

                                    // If tools are being executed, ensure progress stays visible
                                    if (
                                        data.isExecutingTools ||
                                        data.activeToolName
                                    ) {
                                        console.log(
                                            `🔧 [Progress Indicator] Tool execution: ${data.activeToolName || "generic"}`,
                                        );
                                    }

                                    // If we're waiting for AI (between tool calls), show that
                                    if (data.isWaitingForAI) {
                                        console.log(
                                            "⏳ [Progress Indicator] Waiting for AI response between operations",
                                        );
                                    }

                                    // Don't show inline progress anymore since we have the indicator
                                    // Just maintain the current content
                                    if (accumulatedResponse) {
                                        chatStore.updateMessage(
                                            loadingMessageId,
                                            accumulatedResponse,
                                            true,
                                        );
                                    } else if (cleanedText) {
                                        chatStore.updateMessage(
                                            loadingMessageId,
                                            cleanedText,
                                            true,
                                        );
                                    }
                                    // Force scroll to show progress
                                    forceScrollToBottom();
                                } else if (data.content) {
                                    accumulatedResponse += data.content;
                                    console.log(
                                        "💬 Updated response:",
                                        accumulatedResponse,
                                    );

                                    // Extract thinking content and check if we have visible content
                                    const tempExtraction =
                                        extractThinkingContent(
                                            accumulatedResponse,
                                        );
                                    const hasVisibleContent =
                                        tempExtraction.cleanedText.trim()
                                            .length > 0;
                                    const isExecutingTools =
                                        accumulatedResponse.includes(
                                            "[Executing tools...]",
                                        );
                                    const hasToolResults =
                                        accumulatedResponse.includes(
                                            "### Tool:",
                                        );
                                    const toolsStillRunning =
                                        isExecutingTools && !hasToolResults;

                                    // Mark first content received but don't hide progress yet
                                    if (
                                        !firstContentReceived &&
                                        hasVisibleContent
                                    ) {
                                        firstContentReceived = true;
                                        console.log(
                                            "✅ First visible content received, progress continues until done",
                                        );

                                        // Keep progress visible even with content - it will be hidden when done:true is received
                                        if (toolsStillRunning) {
                                            console.log(
                                                "🔧 Tools are executing, progress stays visible",
                                            );
                                            progressMessage =
                                                "🔧 Executing tools...";
                                            progressDetails =
                                                "Retrieving live system data";
                                        }
                                        // Don't hide progress here anymore - wait for done signal
                                    } else if (toolsStillRunning) {
                                        // Keep progress visible during tool execution
                                        showProgress = true;
                                        progressMessage =
                                            "🔧 Executing tools...";
                                        progressDetails =
                                            "Retrieving live system data";
                                        console.log(
                                            "🔧 [Progress Indicator] KEPT VISIBLE - Tools still running",
                                        );
                                    }
                                    // Removed the logic that hides progress when tool results are received
                                    // Progress will only be hidden when done:true is received

                                    // Check for timeout or truncation warnings
                                    const isTimeoutWarning =
                                        data.content.includes(
                                            "**RESPONSE TIMEOUT",
                                        ) ||
                                        data.content.includes(
                                            "**Response timeout**",
                                        ) ||
                                        data.content.includes(
                                            "Tool output was truncated",
                                        );
                                    const isTruncationWarning =
                                        data.content.includes(
                                            "**Response truncated**",
                                        ) ||
                                        data.content.includes(
                                            "JSON output truncated",
                                        );

                                    if (
                                        isTimeoutWarning ||
                                        isTruncationWarning
                                    ) {
                                        console.warn(
                                            "⚠️ Timeout/truncation warning detected:",
                                            data.content,
                                        );
                                        // Force immediate UI update for warnings
                                        const extraction =
                                            extractThinkingContent(
                                                accumulatedResponse,
                                            );
                                        cleanedText = extraction.cleanedText;
                                        chatStore.updateMessage(
                                            loadingMessageId,
                                            cleanedText,
                                            false,
                                        );
                                        forceScrollToBottom();
                                        continue;
                                    }

                                    // Extract thinking content and clean response
                                    const extraction =
                                        extractThinkingContent(
                                            accumulatedResponse,
                                        );
                                    cleanedText = extraction.cleanedText;

                                    // Store thinking but don't update the display yet (avoid jarring transition)
                                    if (extraction.thinking) {
                                        messageThinking.set(
                                            loadingMessageId,
                                            extraction.thinking,
                                        );
                                        // Keep thinking state active to avoid jarring switch during streaming
                                    }

                                    // Update message with cleaned response but keep loading state
                                    chatStore.updateMessage(
                                        loadingMessageId,
                                        cleanedText,
                                        true,
                                    );
                                    // Force scroll on content updates to ensure visibility
                                    forceScrollToBottom();
                                }
                            } catch (e) {
                                console.warn(
                                    "⚠️ Failed to parse line:",
                                    line,
                                    e,
                                );
                            }
                        }
                    }

                    // Break the loop if we received the done signal
                    if (streamComplete) {
                        console.log("🎯 Breaking loop due to done signal");
                        break;
                    }
                }

                console.log("🎉 Stream processing completed successfully");

                // Process any remaining buffer content
                if (buffer.trim()) {
                    console.log("📝 Processing final buffer:", buffer);
                    try {
                        const data = JSON.parse(buffer);
                        if (data.content) {
                            accumulatedResponse += data.content;
                        }
                    } catch (e) {
                        console.warn(
                            "⚠️ Failed to parse final buffer:",
                            buffer,
                            e,
                        );
                    }
                }

                // Final extraction of thinking content and cleaning
                const finalExtraction =
                    extractThinkingContent(accumulatedResponse);
                cleanedText = finalExtraction.cleanedText;

                // Update final thinking state for this message
                if (finalExtraction.thinking) {
                    messageThinking.set(
                        loadingMessageId,
                        finalExtraction.thinking,
                    );
                    currentThinking = finalExtraction.thinking;
                } else if (!messageThinking.has(loadingMessageId)) {
                    // Fallback thinking if none was extracted
                    const fallbackThinking = `Analyzed: "${userMessage}"\n\nSearched knowledge base and formulated response based on Couchbase documentation and best practices.`;
                    messageThinking.set(loadingMessageId, fallbackThinking);
                    currentThinking = fallbackThinking;
                }

                // CRITICAL: Always ensure final message state is not loading
                const finalContent =
                    cleanedText.trim() ||
                    accumulatedResponse ||
                    "Response completed.";

                console.log("🏁 Setting final message state:", {
                    messageId: loadingMessageId,
                    contentLength: finalContent.length,
                    isLoading: false,
                });

                chatStore.updateMessage(loadingMessageId, finalContent, false);

                // Clear thinking when response is complete - add small delay for smoother transition
                setTimeout(() => {
                    currentThinking = "";
                }, 300);

                // Final scroll to ensure all content is visible
                setTimeout(() => forceScrollToBottom(), 200);
            } catch (error) {
                console.error("❌ Stream processing error:", error);
                throw error; // Re-throw to be handled by outer catch block
            } finally {
                console.log("🧹 Cleaning up stream resources");
                reader.releaseLock();
            }
        } catch (error) {
            console.error("❌ Chat error:", error);
            let errorMessage =
                "I apologize, but I encountered an error processing your request. Please try again.";

            // Handle specific error types
            if (error instanceof Error && error.name === "AbortError") {
                // Check if it was a timeout or user-initiated abort
                if (abortController?.signal.reason === "timeout") {
                    errorMessage = `Request timed out after ${CHAT_REQUEST_TIMEOUT / 1000} seconds. This usually happens with very complex queries. Please try:\n• A more specific question\n• Breaking your query into smaller parts\n• Limiting the scope (e.g., "top 5" instead of "all")`;
                    console.log("⏰ Request timed out");
                } else {
                    errorMessage = "Request was cancelled by user.";
                    console.log("🛑 Request was aborted by user");
                }
            } else if (
                error instanceof TypeError &&
                error.message.includes("fetch")
            ) {
                errorMessage =
                    "Unable to connect to the chat service. Please check your internet connection and try again.";
            } else if (error.message?.includes("Failed to fetch")) {
                errorMessage =
                    "Network error occurred. Please check your connection and try again.";
            }

            // Format error with warning icon
            const formattedError = `⚠️ **Service Notice**\n\n${errorMessage}`;
            chatStore.updateMessage(loadingMessageId, formattedError, false);

            // Clear thinking on error - add small delay for smoother transition
            const errorThinking = `Error processing: "${userMessage}"\n\nEncountered an issue while processing your request.`;
            messageThinking.set(loadingMessageId, errorThinking);
            currentThinking = errorThinking;
            setTimeout(() => {
                currentThinking = "";
            }, 300);

            // Transition to error state
            setRequestState("error");
            setTimeout(() => {
                setRequestState("idle");
                requestId = null;
            }, 1000);
        } finally {
            // Clear timeouts and cleanup
            clearTimeout(timeoutId);
            clearTimeout(failsafeTimeoutId);
            abortController = null;
            currentLoadingMessageId = null;

            // Ensure we're back to idle state
            if (requestState !== "idle") {
                setRequestState("idle");
                requestId = null;
            }

            // Reset extended thinking after each response
            enableExtendedThinking = false;
            // Clear progress tracking
            progressMessage = "";
            progressDetails = "";
            currentTokenUsage = null;
            showProgress = false;
            console.log(
                "🔴 [Progress Indicator] DISABLED - Request completed/error in finally block",
            );
            currentEstimatedCost = null;
            console.log(
                "🧹 Cleaned up: timeouts cleared, controllers reset, extended thinking disabled, progress cleared",
            );
        }
    }

    // Handle feedback submission
    async function submitFeedback(messageId: string, score: -1 | 0 | 1) {
        const message = messages.find((m) => m.id === messageId);
        if (!message || !message.runId) {
            console.warn("Cannot submit feedback - message or runId not found");
            return;
        }

        // Check if user is clicking the same feedback button again (to deselect)
        const currentScore = message.feedback?.score;
        let newScore = score;

        if (currentScore === score) {
            // User clicked the same button - deselect (set to neutral/0)
            newScore = 0;
            console.log("Deselecting feedback for message:", messageId);
        } else {
            console.log(
                "Selecting new feedback for message:",
                messageId,
                "score:",
                score,
            );
        }

        // OPTIMISTIC UPDATE: Update UI immediately for instant feedback
        chatStore.updateFeedback(messageId, newScore);

        // API call happens in background
        try {
            console.log("Submitting feedback:", {
                messageId,
                score: newScore,
                runId: message.runId,
            });

            const response = await fetch("/api/feedback", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    runId: message.runId,
                    score: newScore,
                    userId:
                        $userAccount?.localAccountId ||
                        $userAccount?.homeAccountId,
                    userName: $userAccount?.name,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Failed to submit feedback");
            }

            // Track the feedback event
            if (browser && trackerReady) {
                trackEvent("User_Interaction", {
                    type: "feedback",
                    element: "ChatMessage",
                    action:
                        newScore === 1
                            ? "ThumbsUp"
                            : newScore === -1
                              ? "ThumbsDown"
                              : "Deselected",
                    page: "Document Search",
                    messageId: messageId,
                    runId: message.runId,
                });
            }

            console.log("Feedback submitted successfully");
        } catch (error) {
            console.error("Failed to submit feedback:", error);
            // Revert optimistic update on error
            chatStore.updateFeedback(messageId, currentScore || 0);
            // Could show a toast notification here
        }
    }

    function startNewConversation() {
        if (browser && trackerReady) {
            trackEvent("User_Interaction", {
                type: "click",
                element: "ChatAssistant",
                action: "ClearConversation",
                page: "Document Search",
            });
        }

        chatStore.startNewConversation($userAccount?.name);

        // Clear thinking state and reset state machine
        setRequestState("idle");
        requestId = null;
        currentThinking = "";
        messageThinking.clear();
        extendedThinkingMessages.clear();
    }

    $effect(() => {
        console.debug("🤖 Chat Assistant Status Changed:", {
            isOpen,
            timestamp: new Date().toISOString(),
        });
    });

    onMount(() => {
        if (browser) {
            // Calculate scrollbar width
            const scrollDiv = document.createElement("div");
            scrollDiv.style.width = "100px";
            scrollDiv.style.height = "100px";
            scrollDiv.style.overflow = "scroll";
            scrollDiv.style.position = "absolute";
            scrollDiv.style.top = "-9999px";
            document.body.appendChild(scrollDiv);

            const scrollbarWidth =
                scrollDiv.offsetWidth - scrollDiv.clientWidth;
            document.documentElement.style.setProperty(
                "--scrollbar-width",
                `${scrollbarWidth}px`,
            );

            document.body.removeChild(scrollDiv);
        }
    });

    onDestroy(() => {
        // Clean up stuck check interval
        if (window.__stuckCheckInterval) {
            clearInterval(window.__stuckCheckInterval);
            delete window.__stuckCheckInterval;
        }

        // Clean up any pending abort controllers
        if (abortController) {
            abortController.abort();
            abortController = null;
        }
    });

    // Add effect to monitor visibility conditions
    $effect(() => {
        console.debug("🤖 Chat Assistant Visibility:", {
            isInitialized,
            pathname: $page?.url?.pathname,
            isAuthenticated: $isAuthenticated,
            timestamp: new Date().toISOString(),
        });
    });
</script>

{#if $page.url.pathname !== "/login" && $isAuthenticated}
    <div
        class="fixed bottom-4 left-4 z-50 flex flex-col items-start space-y-4"
        class:chat-open={isOpen}
    >
        <button
            type="button"
            onclick={toggleChat}
            class="fixed bottom-24 right-6 z-[45] rounded-full bg-[#00174f] p-4 sm:p-5 text-white shadow-lg hover:bg-[#00174f]/90 hover:ring-2 hover:ring-red-500 hover:ring-offset-2 transition-all duration-300 touch-manipulation"
            aria-label="Toggle chat"
            data-transaction-name="Chat Assistant Toggle"
        >
            {#if !isOpen}
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="1.5"
                    stroke="currentColor"
                    class="w-6 h-6"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                    />
                </svg>
            {:else}
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="1.5"
                    stroke="currentColor"
                    class="w-6 h-6"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M6 18 18 6M6 6l12 12"
                    />
                </svg>
            {/if}
        </button>

        {#if isOpen}
            <button
                type="button"
                class="fixed inset-0 bg-black/20 backdrop-blur-sm z-[46]"
                onclick={toggleChat}
                onkeydown={(e) => e.key === "Escape" && toggleChat()}
                aria-label="Close chat overlay"
                data-transaction-name="Chat Assistant Close"
            ></button>

            <div
                class="fixed bottom-40 right-6 sm:right-4 sm:left-4 md:right-6 md:left-auto w-[800px] max-w-[calc(100vw-3rem)] xl:max-w-[calc(100vw-6rem)] sm:max-w-none md:max-w-[calc(100vw-3rem)] z-[46] rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900"
                role="dialog"
                aria-modal="true"
                aria-label="Chat window"
            >
                <!-- Progress Indicator -->
                <ChatProgressIndicator
                    isActive={progressIndicatorActive}
                    message={progressMessage || "Processing your request..."}
                    details={progressDetails}
                    showElapsedTime={true}
                    tokenUsage={currentTokenUsage}
                    estimatedCost={currentEstimatedCost}
                />

                <div class="flex flex-col h-[80vh] max-h-[800px] min-h-[500px]">
                    <!-- Header -->
                    <div
                        class="flex items-center justify-between border-b border-gray-200 bg-[#00174f] p-4 dark:border-gray-800"
                    >
                        <div class="flex items-center gap-2">
                            <h2 class="font-bold text-white">Chat Assistant</h2>
                        </div>
                        <div class="flex items-center gap-4">
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
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke-width="1.5"
                                        stroke="currentColor"
                                        class="w-4 h-4"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                        />
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
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke-width="1.5"
                                    stroke="currentColor"
                                    class="w-5 h-5"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="M6 18 18 6M6 6l12 12"
                                    />
                                </svg>
                            </Button>
                        </div>
                    </div>

                    <!-- Context Usage Indicator -->
                    {#if conversationSummary}
                        <div
                            class="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
                        >
                            <div
                                class="flex items-center justify-between text-xs"
                            >
                                <div class="flex items-center gap-2">
                                    <span
                                        class="text-gray-600 dark:text-gray-400"
                                        >Context Usage:</span
                                    >
                                    <div class="flex items-center gap-1">
                                        <div
                                            class="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"
                                        >
                                            <div
                                                class="h-full transition-all duration-300 {conversationSummary.contextPercentage >=
                                                90
                                                    ? 'bg-red-500'
                                                    : conversationSummary.contextPercentage >=
                                                        80
                                                      ? 'bg-amber-500'
                                                      : 'bg-green-500'}"
                                                style="width: {conversationSummary.contextPercentage}%"
                                            ></div>
                                        </div>
                                        <span
                                            class={conversationSummary.contextPercentage >=
                                            90
                                                ? "text-red-600 dark:text-red-400 font-semibold"
                                                : conversationSummary.contextPercentage >=
                                                    80
                                                  ? "text-amber-600 dark:text-amber-400"
                                                  : "text-gray-600 dark:text-gray-400"}
                                        >
                                            {conversationSummary.messageCount}/{conversationSummary.contextLimit}
                                            messages
                                        </span>
                                    </div>
                                </div>
                                <div class="flex items-center gap-3">
                                    {#if conversationSummary.contextPercentage >= 80}
                                        <span
                                            class="text-amber-600 dark:text-amber-400"
                                        >
                                            {conversationSummary.contextPercentage >=
                                            90
                                                ? "⚠️ Near limit"
                                                : "⚠️ Approaching limit"}
                                        </span>
                                    {/if}
                                    {#if conversationSummary.isNearExpiry}
                                        <span
                                            class="text-red-600 dark:text-red-400 font-semibold"
                                        >
                                            ⏰ History expires in {Math.floor(
                                                conversationSummary.remainingHours,
                                            )}h {Math.floor(
                                                (conversationSummary.remainingHours %
                                                    1) *
                                                    60,
                                            )}m
                                        </span>
                                    {:else if conversationSummary.ageInHours > 12}
                                        <span
                                            class="text-gray-500 dark:text-gray-500"
                                        >
                                            History expires in {Math.floor(
                                                conversationSummary.remainingHours,
                                            )}h
                                        </span>
                                    {/if}
                                </div>
                            </div>
                        </div>
                    {/if}

                    <!-- Messages -->
                    <div
                        bind:this={messagesContainer}
                        class="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
                        role="log"
                        aria-label="Chat messages"
                    >
                        {#each messages as message}
                            <div
                                class="flex {message.type === 'user'
                                    ? 'justify-end'
                                    : 'justify-start'} items-start gap-2"
                            >
                                {#if message.type === "bot"}
                                    <div
                                        class="w-8 h-8 rounded-full bg-[#00174f] flex-shrink-0 flex items-center justify-center"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke-width="1.5"
                                            stroke="currentColor"
                                            class="w-5 h-5 text-white"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                                            />
                                        </svg>
                                    </div>
                                {/if}
                                <div class="flex flex-col max-w-[80%]">
                                    <!-- Show simple spinner during thinking, then AI Reasoning when complete -->
                                    {#if message.type === "bot" && message.isLoading && !messageThinking.has(message.id)}
                                        <!-- Simple thinking spinner -->
                                        <div
                                            class="flex items-center gap-2 mb-2 text-blue-600 dark:text-blue-400"
                                        >
                                            <div
                                                class="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent flex-shrink-0"
                                            ></div>
                                            <span class="text-sm font-medium">
                                                {extendedThinkingMessages.has(
                                                    message.id,
                                                )
                                                    ? "Extended Thinking..."
                                                    : "Thinking..."}
                                            </span>
                                        </div>
                                    {/if}

                                    {#if message.type === "bot" && message.content && message.content.includes("[Executing tools...]")}
                                        <!-- Tool execution indicator -->
                                        <div
                                            class="flex items-center gap-2 mb-2 text-amber-600 dark:text-amber-400"
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke-width="1.5"
                                                stroke="currentColor"
                                                class="w-4 h-4 animate-pulse"
                                            >
                                                <path
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 3.096l-.102.104m-1.64 1.64-.196.196a5.661 5.661 0 0 1-4.013 1.664 5.662 5.662 0 0 1-5.664-5.664 5.661 5.661 0 0 1 1.664-4.013l4.014-4.014"
                                                />
                                            </svg>
                                            <span class="text-sm font-medium"
                                                >Executing tools to get live
                                                data...</span
                                            >
                                        </div>
                                    {/if}

                                    {#if message.type === "bot" && messageThinking.has(message.id)}
                                        <!-- AI Reasoning (collapsed by default) -->
                                        <ThinkingSection
                                            isThinking={false}
                                            thinkingText={messageThinking.get(
                                                message.id,
                                            ) || ""}
                                        />
                                    {/if}

                                    <!-- Only show response content when there's actual text to display -->
                                    {#if message.type === "bot" && message.isLoading && !messageThinking.has(message.id)}
                                        <!-- Don't show response while thinking -->
                                    {:else if (message.type === "bot" && message.text.trim()) || message.type === "user"}
                                        <div
                                            class="rounded-lg px-4 py-2 {message.type ===
                                            'user'
                                                ? 'bg-[#00174f] text-white'
                                                : message.type === 'bot' &&
                                                    message.text.startsWith(
                                                        '⚠️',
                                                    )
                                                  ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
                                                  : 'bg-gray-100 dark:bg-gray-800'}"
                                        >
                                            <div
                                                class="prose prose-sm max-w-none dark:prose-invert prose-pre:bg-gray-900 prose-pre:text-gray-100 overflow-x-auto"
                                            >
                                                {#if message.type === "bot"}
                                                    {#if message.text.includes("References:")}
                                                        {@html renderMarkdown(
                                                            message.text.split(
                                                                "References:",
                                                            )[0],
                                                        )}
                                                        <div
                                                            class="mt-2 text-sm text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-2"
                                                        >
                                                            References:
                                                            {#each message.text
                                                                .split("References:")[1]
                                                                .trim()
                                                                .split("\n")
                                                                .filter( (ref) => ref.trim(), ) as ref}
                                                                <div
                                                                    class="break-all"
                                                                >
                                                                    - {ref.trim()}
                                                                </div>
                                                            {/each}
                                                        </div>
                                                    {:else}
                                                        {@html renderMarkdown(
                                                            message.text,
                                                        )}
                                                    {/if}
                                                {:else}
                                                    <div
                                                        class="whitespace-pre-wrap break-words"
                                                    >
                                                        {message.text}
                                                    </div>
                                                {/if}
                                            </div>

                                            <!-- Feedback buttons for assistant messages -->
                                            {#if message.type === "bot" && !message.isLoading && message.runId}
                                                <div
                                                    class="flex items-center gap-1 mt-2 pt-2 border-t border-gray-200 dark:border-gray-600"
                                                >
                                                    <span
                                                        class="text-xs text-gray-500 dark:text-gray-400 mr-2"
                                                        >Rate this response:</span
                                                    >

                                                    <!-- Thumbs Up Button -->
                                                    <button
                                                        onclick={() =>
                                                            submitFeedback(
                                                                message.id,
                                                                1,
                                                            )}
                                                        class="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors {message
                                                            .feedback?.score ===
                                                        1
                                                            ? 'text-green-600'
                                                            : 'text-gray-400 hover:text-green-600'}"
                                                        title="Thumbs up"
                                                        aria-label="Rate this response as helpful"
                                                    >
                                                        <svg
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            fill={message
                                                                .feedback
                                                                ?.score === 1
                                                                ? "currentColor"
                                                                : "none"}
                                                            viewBox="0 0 24 24"
                                                            stroke-width="1.5"
                                                            stroke="currentColor"
                                                            class="w-5 h-5"
                                                        >
                                                            <path
                                                                stroke-linecap="round"
                                                                stroke-linejoin="round"
                                                                d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V2.75a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904m10.598-9.75H14.25M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 0 1-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 0 0-1.302 4.665c0 1.194.232 2.333.654 3.375Z"
                                                            />
                                                        </svg>
                                                    </button>

                                                    <!-- Thumbs Down Button -->
                                                    <button
                                                        onclick={() =>
                                                            submitFeedback(
                                                                message.id,
                                                                -1,
                                                            )}
                                                        class="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors {message
                                                            .feedback?.score ===
                                                        -1
                                                            ? 'text-red-600'
                                                            : 'text-gray-400 hover:text-red-600'}"
                                                        title="Thumbs down"
                                                        aria-label="Rate this response as not helpful"
                                                    >
                                                        <svg
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            fill={message
                                                                .feedback
                                                                ?.score === -1
                                                                ? "currentColor"
                                                                : "none"}
                                                            viewBox="0 0 24 24"
                                                            stroke-width="1.5"
                                                            stroke="currentColor"
                                                            class="w-5 h-5"
                                                        >
                                                            <path
                                                                stroke-linecap="round"
                                                                stroke-linejoin="round"
                                                                d="M7.498 15.25H4.372c-1.026 0-1.945-.694-2.054-1.715a12.137 12.137 0 0 1-.068-1.285c0-2.848.992-5.464 2.649-7.521C5.287 4.247 5.886 4 6.504 4h4.016a4.5 4.5 0 0 1 1.423.23l3.114 1.04a4.5 4.5 0 0 0 1.423.23h1.294M7.498 15.25c.618 0 .991.724.725 1.282A7.471 7.471 0 0 0 7.5 19.75 2.25 2.25 0 0 0 9.75 22a.75.75 0 0 0 .75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 0 0 2.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384m-10.253 1.5H9.7m8.075-9.75c.01.05.027.1.05.148.593 1.2.925 2.55.925 3.977 0 1.487-.36 2.89-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398-.306.774-1.086 1.227-1.918 1.227h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 0 0 .303-.54"
                                                            />
                                                        </svg>
                                                    </button>
                                                </div>
                                            {/if}
                                        </div>
                                    {/if}
                                </div>
                                {#if message.type === "user"}
                                    <img
                                        src={userPhoto}
                                        alt="User"
                                        class="w-8 h-8 rounded-full object-cover flex-shrink-0"
                                    />
                                {/if}
                            </div>
                        {/each}
                    </div>

                    <!-- Suggested Queries -->
                    {#if showSuggestedQueries}
                        <SuggestedQueries 
                            onQuerySelect={(query, useExtendedThinking) => {
                                newMessage = query;
                                enableExtendedThinking = useExtendedThinking || false;
                                handleSubmit();
                            }}
                        />
                    {/if}

                    <!-- Disclaimer -->
                    <div class="px-4 py-2 text-center">
                        <p class="text-xs text-gray-500 dark:text-gray-400">
                            This Chat Assistant can make mistakes. Please
                            double-check responses.
                        </p>
                    </div>

                    <!-- Input -->
                    <form
                        onsubmit={(e) => {
                            e.preventDefault();
                            console.log(
                                "📋 Form submitted, isLoading:",
                                isLoading,
                                "newMessage:",
                                newMessage,
                                "abortController:",
                                !!abortController,
                            );
                            if (isLoading && abortController) {
                                console.log(
                                    "🛑 Calling handleAbort from form submission",
                                );
                                handleAbort();
                            } else if (!isLoading && newMessage.trim()) {
                                console.log(
                                    "📤 Calling handleSubmit from form submission",
                                );
                                handleSubmit();
                            } else {
                                console.log(
                                    "⚠️ Form submitted but conditions not met",
                                );
                            }
                        }}
                        class="border-t border-gray-200 p-4 dark:border-gray-800"
                    >
                        <div class="flex gap-2">
                            <input
                                type="text"
                                bind:value={newMessage}
                                placeholder={inputPlaceholder}
                                disabled={isLoading}
                                class="flex-1 rounded-md border border-gray-300 px-3 py-2 sm:py-3 text-sm focus:outline-none focus:ring focus:ring-tommy-red/50 dark:border-gray-700 bg-white text-black dark:bg-white dark:text-black disabled:opacity-50 touch-manipulation"
                                aria-label="Message input"
                            />
                            <!-- Extended Thinking Toggle Button -->
                            <button
                                type="button"
                                onclick={() =>
                                    (enableExtendedThinking =
                                        !enableExtendedThinking)}
                                class="p-2 rounded-md border transition-all duration-300 touch-manipulation hover:ring-2 hover:ring-red-500 hover:ring-offset-2 {enableExtendedThinking
                                    ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:bg-gray-700'}"
                                title={enableExtendedThinking
                                    ? "Extended thinking enabled"
                                    : "Enable extended thinking for complex problem solving"}
                                aria-label="Toggle extended thinking"
                                disabled={isLoading}
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke-width="1.5"
                                    stroke="currentColor"
                                    class="w-5 h-5"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
                                    />
                                </svg>
                            </button>
                            <Button
                                type="submit"
                                variant={isLoading ? "destructive" : "default"}
                                disabled={isButtonDisabled}
                                aria-label={isLoading
                                    ? "Stop request"
                                    : "Send message"}
                                data-transaction-name={isLoading
                                    ? "Stop Chat Query"
                                    : "Send Chat Query"}
                                class="px-4 py-2 sm:px-6 sm:py-3 touch-manipulation {isLoading
                                    ? 'bg-red-600 hover:bg-red-700'
                                    : 'bg-[#00174f] hover:bg-[#00174f]/90'}"
                            >
                                {#if isLoading}
                                    Stop
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
        overflow: hidden !important;
        max-width: 100% !important;
        border-radius: 0.375rem !important;
        background-color: #1f2937 !important;
    }

    :global(.prose pre) {
        background-color: #1f2937 !important;
        color: #f9fafb !important;
        border-radius: 0.375rem !important;
        padding: 1rem !important;
        padding-top: 2.5rem !important; /* Make room for copy button */
        margin: 0 !important;
        overflow-x: auto !important;
        white-space: pre-wrap !important;
        word-wrap: break-word !important;
        max-width: 100% !important;
        /* Allow scrolling only when content truly exceeds container */
        scrollbar-width: thin !important;
        scrollbar-color: #4b5563 #374151 !important;
    }

    /* Improve styling for long lines in tool responses */
    :global(.prose code:not(pre code)) {
        white-space: normal !important;
        word-break: break-word !important;
        background-color: #f3f4f6 !important;
        color: #374151 !important;
        padding: 0.125rem 0.25rem !important;
        border-radius: 0.25rem !important;
        font-size: 0.875em !important;
    }

    /* Handle long lines in regular text */
    :global(.prose p) {
        overflow-wrap: break-word !important;
        word-break: break-word !important;
        line-height: 1.6 !important;
    }

    /* Improve handling of long URLs and technical content */
    :global(.prose a) {
        word-break: break-all !important;
        overflow-wrap: break-word !important;
        color: #2563eb !important;
        text-decoration: underline !important;
        text-decoration-color: #93c5fd !important;
    }

    :global(.prose a:hover) {
        text-decoration-color: #2563eb !important;
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

    /* Improve table styling for technical content */
    :global(.prose table) {
        width: 100% !important;
        max-width: 100% !important;
        overflow-x: auto !important;
        border-collapse: collapse !important;
        margin: 0.5rem 0 !important;
    }

    :global(.prose th, .prose td) {
        border: 1px solid #d1d5db !important;
        padding: 0.5rem !important;
        text-align: left !important;
        word-break: break-word !important;
        overflow-wrap: break-word !important;
    }

    :global(.prose th) {
        background-color: #f9fafb !important;
        font-weight: 600 !important;
    }

    :global(.prose tbody tr:nth-child(even)) {
        background-color: #f9fafb !important;
    }

    /* Better spacing for technical lists */
    :global(.prose ul li, .prose ol li) {
        margin: 0.25rem 0 !important;
        overflow-wrap: break-word !important;
        word-break: break-word !important;
    }

    /* Improve technical term readability */
    :global(.prose em) {
        font-style: italic !important;
        color: #6b7280 !important;
    }

    /* Better handling for inline technical terms */
    :global(.prose strong code) {
        background-color: #fef3c7 !important;
        color: #92400e !important;
        font-weight: 600 !important;
    }

    /* Mobile-specific improvements */
    @media (max-width: 768px) {
        :global(.prose pre) {
            font-size: 0.75rem !important;
            padding: 0.75rem !important;
            padding-top: 2rem !important;
        }

        :global(.copy-btn) {
            padding: 0.375rem 0.5rem !important;
            font-size: 0.75rem !important;
            top: 0.25rem !important;
            right: 0.25rem !important;
        }

        :global(.prose) {
            font-size: 0.875rem !important;
        }

        :global(
            .prose h1,
            .prose h2,
            .prose h3,
            .prose h4,
            .prose h5,
            .prose h6
        ) {
            font-size: 1rem !important;
            margin-top: 0.75rem !important;
            margin-bottom: 0.375rem !important;
        }
    }
</style>
