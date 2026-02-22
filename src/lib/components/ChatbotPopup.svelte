<!-- src/lib/components/ChatbotPopup.svelte -->

<script lang="ts">
import hljs from "highlight.js/lib/core";
import { marked } from "marked";
import { onDestroy, onMount } from "svelte";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { browser } from "$app/environment";
import { page } from "$app/state";
import { getMsalInstance } from "$lib/config/authConfig";
import { isTrackerReady, trackEvent } from "$lib/context/tracker";
import { authStore } from "$lib/stores/auth.svelte";
import { type Conversation, chatStore, formatMessagesForDisplay } from "$lib/stores/chat.svelte";
import { ensureUserPhoto, photoStore } from "$lib/stores/photo.svelte";
import { get } from "svelte/store";
import "highlight.js/styles/github-dark.css";
import CompletedProgress from "./CompletedProgress.svelte";
import ThinkingSection from "./ThinkingSection.svelte";
import SuggestedQueries from "./SuggestedQueries.svelte";
import { Button } from "./ui/button";

// Timeout configurations (with defaults matching backend)
const CHAT_REQUEST_TIMEOUT = import.meta.env.CHAT_REQUEST_TIMEOUT
  ? parseInt(import.meta.env.CHAT_REQUEST_TIMEOUT, 10)
  : 300000; // 5 minutes
const CHAT_FAILSAFE_TIMEOUT = import.meta.env.CHAT_FAILSAFE_TIMEOUT
  ? parseInt(import.meta.env.CHAT_FAILSAFE_TIMEOUT, 10)
  : 270000; // 4.5 minutes
const CHAT_STUCK_CHECK_TIMEOUT = import.meta.env.CHAT_STUCK_CHECK_TIMEOUT
  ? parseInt(import.meta.env.CHAT_STUCK_CHECK_TIMEOUT, 10)
  : 240000; // 4 minutes
const STUCK_CHECK_INTERVAL = 5000; // Check every 5 seconds

import bash from "highlight.js/lib/languages/bash";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
// Import specific language support for highlight.js
import sql from "highlight.js/lib/languages/sql";
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
  highlight: (code, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch (_err) {
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
function _renderMarkdown(text: string): string {
  try {
    let html = marked.parse(text);

    // Add copy buttons to code blocks
    html = html.replace(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/g, (_match, codeContent) => {
      // Generate unique ID for this code block
      const codeId = `code-${Math.random().toString(36).substr(2, 9)}`;

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
    });

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

interface Props {
  isOpen?: boolean;
  ontoggle?: () => void;
}

const { isOpen = false, ontoggle }: Props = $props();

// Request state machine
type RequestState = "idle" | "initializing" | "thinking" | "streaming" | "aborting" | "error";
let requestState = $state<RequestState>("idle");
let requestId = $state<string | null>(null);

// Helper function to update request state with logging
function setRequestState(newState: RequestState) {
  const oldState = requestState;
  requestState = newState;
  console.log(`[STATE] [Request State] ${oldState} -> ${newState}`);
}

// Derived loading state from request state
let isLoading = $derived(requestState !== "idle");
let canSubmit = $derived(requestState === "idle");
let canAbort = $derived(
  requestState === "initializing" || requestState === "thinking" || requestState === "streaming"
);

let newMessage = $state("");
let _userPhoto = $derived(photoStore.url);
let trackerReady = $state(false);
let isInitialized = $state(false);
let currentThinking = $state("");
let isThinking = $derived(requestState === "thinking" || requestState === "initializing");
let abortController = $state<AbortController | null>(null);
let currentLoadingMessageId = $state<string | null>(null);

// Progress tracking (legacy - kept for backward compatibility)
let progressMessage = $state("");
let showProgress = $state(false);

// Track thinking content per message
let messageThinking = $state(new SvelteMap<string, string>());
// Track which messages used extended thinking
let extendedThinkingMessages = $state(new SvelteSet<string>());
let enableExtendedThinking = $state(false);

// Track progress data per message for CompletedProgress component
interface MessageProgressData {
  completedNodes: string[];
  completedTools: { name: string; duration?: number }[];
  responseTime?: number;
  activeNode?: string;
  activeTool?: string;
  toolStartTime?: number;
}
let messageProgress = $state(new SvelteMap<string, MessageProgressData>());

// Use derived directly from the runes-based store
let conversation = $derived(chatStore.conversation);
let messages = $derived(formatMessagesForDisplay(conversation));

// Track if we should show suggested queries
let _showSuggestedQueries = $derived(
  messages.length <= 1 && // Only greeting message
    requestState === "idle" && // Not loading
    !newMessage.trim() // No text in input
);
let _conversationSummary = $derived(conversation ? chatStore.getConversationSummary() : null);

// Derive placeholder reactively to fix clear conversation issue
const MAX_CONTEXT_THRESHOLD = 16; // 80% of 20 messages limit
let _inputPlaceholder = $derived(
  isLoading
    ? "Please wait..."
    : conversation &&
        conversation.messages.filter((msg) => !msg.isLoading).length > MAX_CONTEXT_THRESHOLD
      ? "Approaching context limit - consider clearing conversation..."
      : "Type your Couchbase Capella related question here..."
);

// Derive button disabled state for better reactivity
let _isButtonDisabled = $derived(canAbort ? false : !newMessage.trim());


// Get first name from full name
function _getFirstName(fullName: string = ""): string {
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
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }, 50);
    });
  }
}

$effect(() => {
  console.debug("[AI] Chat Assistant Visibility Check:", {
    trackerReady,
    timestamp: new Date().toISOString(),
  });
});

onMount(async () => {
  try {
    // Wait for tracker to be ready
    while (!isTrackerReady()) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    trackerReady = true;
    isInitialized = true;

    console.debug("[AI] Chat Assistant Init:", {
      trackerReady,
      pathname: page?.url?.pathname,
      isAuthenticated: authStore.isAuthenticated,
      timestamp: new Date().toISOString(),
    });

    // Initialize chat store
    chatStore.initialize(authStore.userAccount?.name);

    // Set up periodic check for stuck loading states
    const stuckCheckInterval = setInterval(() => {
      if (messages.length > 0) {
        const stuckMessages = messages.filter(
          (m) =>
            m.isLoading &&
            m.timestamp &&
            Date.now() - new Date(m.timestamp).getTime() > CHAT_STUCK_CHECK_TIMEOUT
        );

        if (stuckMessages.length > 0) {
          console.warn(
            "[WARNING] Detected stuck loading messages:",
            stuckMessages.length,
            "after",
            CHAT_STUCK_CHECK_TIMEOUT / 1000,
            "seconds"
          );
          stuckMessages.forEach((msg) => {
            console.log("[FIX] Force-clearing stuck message:", msg.id);
            chatStore.updateMessage(
              msg.id,
              msg.content ||
                "Request timed out. The query took longer than expected. Please try a more specific query or break it into smaller parts.",
              false
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
    const currentUserAccount = authStore.userAccount;
    if (authStore.isAuthenticated && currentUserAccount) {
      const msalInstance = await getMsalInstance();
      if (msalInstance) {
        try {
          const tokenResponse = await msalInstance.acquireTokenSilent({
            scopes: ["User.Read", "User.ReadBasic.All", "user.read.all", "user.read"],
          });

          await ensureUserPhoto(tokenResponse.accessToken, currentUserAccount.localAccountId);
        } catch (error) {
          console.warn("Failed to fetch user photo:", error);
        }
      }
    }
  } catch (error) {
    console.warn("[AI] Chat Assistant: Initialization failed", error);
    trackerReady = true;
    isInitialized = true;
  }
});

function _toggleChat() {
  ontoggle?.();

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

function _handleAbort() {
  console.log(
    "[ABORT] handleAbort called, requestState:",
    requestState,
    "abortController:",
    !!abortController,
    "loadingMessageId:",
    currentLoadingMessageId
  );

  if (!canAbort) {
    console.log("[WARNING] Cannot abort in current state:", requestState);
    return;
  }

  // Update state to aborting
  setRequestState("aborting");

  if (abortController) {
    console.log("[ABORT] User requested to abort chat request");
    abortController.abort();
    abortController = null;

    // Use the stored loading message ID
    if (currentLoadingMessageId) {
      chatStore.updateMessage(currentLoadingMessageId, "Request was cancelled by user.", false);
      console.log("[OK] Updated message with cancellation notice");
      currentLoadingMessageId = null;
    } else {
      console.log("[WARNING] No loading message ID stored");
    }

    // Clear progress
    progressMessage = "";
    showProgress = false;
  } else {
    console.log("[WARNING] No abortController to abort");
  }

  // Reset to idle state
  setRequestState("idle");
  requestId = null;
}

async function _handleSubmit() {
  // Prevent submission if not in idle state or no message
  if (!canSubmit || !newMessage.trim()) {
    console.log("[WARNING] Prevented submission:", {
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
  console.log("[ID] Starting new request:", requestId);

  // Update state machine
  setRequestState("initializing");
  currentThinking = `Analyzing your question: "${userMessage}"\n\nProcessing context and searching relevant information...`;

  // Initialize progress tracking for this message
  progressMessage = "Initializing request...";
  showProgress = true;

  // Create new AbortController for this request
  abortController = new AbortController();

  // Set up timeout matching backend timeout
  const timeoutId = setTimeout(() => {
    if (abortController) {
      console.log(`[TIMEOUT] Chat request timed out after ${CHAT_REQUEST_TIMEOUT / 1000} seconds`);
      abortController.abort("timeout");
    }
  }, CHAT_REQUEST_TIMEOUT);

  // Set up failsafe timeout to ensure thinking state is cleared (slightly before main timeout)
  const failsafeTimeoutId = setTimeout(() => {
    console.log(
      `[TIMEOUT] Failsafe timeout triggered after ${CHAT_FAILSAFE_TIMEOUT / 1000} seconds - clearing thinking state`
    );
    if ((requestState === "thinking" || requestState === "streaming") && currentLoadingMessageId) {
      // Force clear the loading state
      chatStore.updateMessage(
        currentLoadingMessageId,
        "Request is taking longer than expected. The response may be truncated.",
        false
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
    const loadingMessageId = chatStore.addMessage("assistant", "", true);
    currentLoadingMessageId = loadingMessageId;
    console.log("[MESSAGE] Created loading message with ID:", loadingMessageId);

    // Initialize progress tracking for this message
    messageProgress.set(loadingMessageId, {
      completedNodes: [],
      completedTools: [],
    });

    // Don't set initial thinking - wait for actual <thinking> tags from the LLM
    // AI Reasoning will only show if the LLM includes thinking content

    // Track if this message uses extended thinking
    if (enableExtendedThinking) {
      extendedThinkingMessages.add(loadingMessageId);
    }

    // Transition to thinking state
    setRequestState("thinking");
    progressMessage = "AI is processing your request...";

    const sessionStartTime = new Date().toISOString();
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: abortController.signal,
      body: JSON.stringify({
        messages: chatStore.getMessagesForAPI(),
        user: (() => {
          const account = authStore.userAccount;
          return account
            ? {
                id: account.localAccountId || account.homeAccountId,
                name: account.name,
                username: account.username,
                email: account.username, // Usually contains email
                tenantId: account.tenantId,
                environment: account.environment,
                isAuthenticated: authStore.isAuthenticated,
                // Add session/interaction context
                sessionStartTime: sessionStartTime,
                messageCount: messages.length,
                clientTimestamp: new Date().toISOString(),
                pathname: page?.url?.pathname,
                conversationId: conversation?.id,
              }
            : null;
        })(),
        enableExtendedThinking: enableExtendedThinking,
      }),
    });

    if (!response.ok) {
      // Try to parse error response if it's JSON
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        try {
          const errorData = await response.json();
          if (errorData.message) {
            throw new Error(errorData.message);
          }
        } catch (_parseError) {
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
    let _extractedThinking = "";
    let _cleanedResponse = "";
    let cleanedText = "";
    let firstContentReceived = false;

    console.log("[STREAM] Starting stream processing");

    // Transition to streaming state
    setRequestState("streaming");
    progressMessage = "Receiving response...";

    try {
      let streamComplete = false;
      let readAttempts = 0;
      const maxReadAttempts = 3;

      while (!streamComplete) {
        // Check if aborted before reading next chunk
        if (!abortController || abortController.signal.aborted) {
          console.log("[ABORT] Stream reading aborted");
          streamComplete = true;
          break;
        }

        console.log("[READ] Reading next chunk...");
        let result;

        try {
          result = await reader.read();
          readAttempts = 0; // Reset attempts on successful read
        } catch (readError) {
          readAttempts++;
          console.error(
            `[ERROR] Read error (attempt ${readAttempts}/${maxReadAttempts}):`,
            readError
          );

          if (readAttempts >= maxReadAttempts) {
            throw new Error("Failed to read stream after multiple attempts");
          }

          // Wait briefly before retry
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        console.log("[RESULT] Read result:", {
          done: result.done,
          hasValue: !!result.value,
        });

        // Check for stream completion before processing value
        if (result.done) {
          console.log("[OK] Stream completed normally");
          streamComplete = true;
          break;
        }

        // Decode the current chunk and add it to the buffer
        const newText = decoder.decode(result.value, {
          stream: true,
        });
        console.log("[DECODE] Decoded chunk:", {
          chunkLength: newText.length,
          hasNewlines: newText.includes("\n"),
          newlineCount: (newText.match(/\n/g) || []).length,
          preview: newText.substring(0, 300) + (newText.length > 300 ? "..." : ""),
          fullChunk: newText.length < 500 ? newText : "[TRUNCATED]",
        });
        buffer += newText;

        // Process complete lines from the buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep the last incomplete line in the buffer

        console.log("[PROCESS] Processing lines:", {
          lineCount: lines.length,
          remainingBuffer: buffer,
        });

        for (const line of lines) {
          const trimmedLine = line.trim();
          console.log("[LINE] Processing line:", {
            length: line.length,
            trimmedLength: trimmedLine.length,
            startsWithBrace: trimmedLine.startsWith("{"),
            preview: line.substring(0, 150) + (line.length > 150 ? "..." : ""),
          });
          if (trimmedLine) {
            try {
              const data = JSON.parse(trimmedLine);
              console.log("[DATA] Parsed successfully:", {
                keys: Object.keys(data),
                type: data.type,
                nodeName: data.nodeName,
                toolName: data.toolName,
                hasContent: "content" in data,
                contentLength: data.content?.length || 0,
                isDone: data.done === true,
                isError: data.error === true,
                hasFinalResponse: "finalResponse" in data,
                finalResponseLength: data.finalResponse?.length || 0,
              });

              if (data.done) {
                console.log("[DONE] Received done signal", {
                  runId: data.runId,
                  executionTimeMs: data.executionTimeMs,
                });
                showProgress = false;

                // Capture response time in progress data - create new object for reactivity
                const existing = messageProgress.get(loadingMessageId) || {
                  completedNodes: [],
                  completedTools: [],
                };
                messageProgress.set(loadingMessageId, {
                  ...existing,
                  responseTime: data.executionTimeMs,
                });

                // Use finalResponse from done event as fallback if no content was accumulated
                let finalContent = cleanedText || accumulatedResponse;
                if (!finalContent && data.finalResponse) {
                  console.log("[FALLBACK] Using finalResponse from done event");
                  finalContent = data.finalResponse;
                }

                // Capture runId if provided in done message
                if (data.runId && !data.error) {
                  chatStore.updateMessage(loadingMessageId, finalContent, false, data.runId);
                } else {
                  chatStore.updateMessage(loadingMessageId, finalContent, false);
                }
                setRequestState("idle");
                requestId = null;
                streamComplete = true;
                break;
              }

              if (data.error) {
                console.error("[ERROR] Received error from server:", data.content);
                const errorContent =
                  data.content || "An error occurred while processing your request.";
                const formattedError = `[WARNING] **Service Notice**\n\n${errorContent}`;
                chatStore.updateMessage(loadingMessageId, formattedError, false);
                showProgress = false;
                progressMessage = "";
                streamComplete = true;
                break;
              }

              // Handle node start events - create new object for reactivity
              if (data.type === "node_start") {
                console.log("[NODE_START]", data.nodeName, data.message);
                const existing = messageProgress.get(loadingMessageId) || {
                  completedNodes: [],
                  completedTools: [],
                };
                messageProgress.set(loadingMessageId, {
                  ...existing,
                  activeNode: data.nodeName,
                });
                progressMessage = data.message || `Running ${data.nodeName}...`;
                showProgress = true;
                forceScrollToBottom();
              }
              // Handle node end events - create new object for reactivity
              else if (data.type === "node_end") {
                console.log("[NODE_END]", data.nodeName);
                const existing = messageProgress.get(loadingMessageId) || {
                  completedNodes: [],
                  completedTools: [],
                };
                const newCompletedNodes = existing.completedNodes.includes(data.nodeName)
                  ? existing.completedNodes
                  : [...existing.completedNodes, data.nodeName];
                messageProgress.set(loadingMessageId, {
                  ...existing,
                  completedNodes: newCompletedNodes,
                  activeNode: undefined,
                });
              }
              // Handle tool start events - create new object for reactivity
              else if (data.type === "tool_start") {
                console.log("[TOOL_START]", data.toolName);
                const existing = messageProgress.get(loadingMessageId) || {
                  completedNodes: [],
                  completedTools: [],
                };
                messageProgress.set(loadingMessageId, {
                  ...existing,
                  activeTool: data.toolName,
                  toolStartTime: Date.now(),
                });
                progressMessage = data.message || `Executing ${data.toolName}...`;
                showProgress = true;
                forceScrollToBottom();
              }
              // Handle tool end events - create new object for reactivity
              else if (data.type === "tool_end") {
                console.log("[TOOL_END]", data.toolName);
                const existing = messageProgress.get(loadingMessageId) || {
                  completedNodes: [],
                  completedTools: [],
                };
                const duration = existing.toolStartTime ? Date.now() - existing.toolStartTime : undefined;
                messageProgress.set(loadingMessageId, {
                  ...existing,
                  completedTools: [...existing.completedTools, { name: data.toolName, duration }],
                  activeTool: undefined,
                  toolStartTime: undefined,
                });
              }
              // Legacy progress event handling for backward compatibility
              else if (data.type === "progress") {
                console.log("[PROGRESS] Legacy progress update:", data.message);
                progressMessage = data.message || progressMessage;
                showProgress = true;
                forceScrollToBottom();
              } else if (data.content) {
                console.log("[CONTENT] Received content event:", {
                  contentLength: data.content.length,
                  contentPreview: data.content.substring(0, 100),
                  previousAccumulatedLength: accumulatedResponse.length,
                });
                accumulatedResponse += data.content;
                console.log("[CONTENT] After accumulation:", {
                  totalAccumulatedLength: accumulatedResponse.length,
                  accumulatedPreview: accumulatedResponse.substring(0, 100),
                });

                // Extract thinking content and check if we have visible content
                const tempExtraction = extractThinkingContent(accumulatedResponse);
                const hasVisibleContent = tempExtraction.cleanedText.trim().length > 0;

                // Mark first content received
                if (!firstContentReceived && hasVisibleContent) {
                  firstContentReceived = true;
                  console.log("[OK] First visible content received");
                }

                // Check for timeout or truncation warnings
                const isTimeoutWarning =
                  data.content.includes("**RESPONSE TIMEOUT") ||
                  data.content.includes("**Response timeout**") ||
                  data.content.includes("Tool output was truncated");
                const isTruncationWarning =
                  data.content.includes("**Response truncated**") ||
                  data.content.includes("JSON output truncated");

                if (isTimeoutWarning || isTruncationWarning) {
                  console.warn("[WARNING] Timeout/truncation warning detected:", data.content);
                  // Force immediate UI update for warnings
                  const extraction = extractThinkingContent(accumulatedResponse);
                  cleanedText = extraction.cleanedText;
                  chatStore.updateMessage(loadingMessageId, cleanedText, false);
                  forceScrollToBottom();
                  continue;
                }

                // Extract thinking content and clean response
                const extraction = extractThinkingContent(accumulatedResponse);
                cleanedText = extraction.cleanedText;

                // Store thinking but don't update the display yet (avoid jarring transition)
                if (extraction.thinking) {
                  messageThinking.set(loadingMessageId, extraction.thinking);
                  // Keep thinking state active to avoid jarring switch during streaming
                }

                // Update message with cleaned response but keep loading state
                chatStore.updateMessage(loadingMessageId, cleanedText, true);
                // Force scroll on content updates to ensure visibility
                forceScrollToBottom();
              }
            } catch (e) {
              console.warn("[WARNING] Failed to parse line:", line, e);
            }
          }
        }

        // Break the loop if we received the done signal
        if (streamComplete) {
          console.log("[DONE] Breaking loop due to done signal");
          break;
        }
      }

      console.log("[SUCCESS] Stream processing completed successfully");

      // Process any remaining buffer content
      if (buffer.trim()) {
        console.log("[PROCESS] Processing final buffer:", buffer);
        try {
          const data = JSON.parse(buffer);
          if (data.content) {
            accumulatedResponse += data.content;
          }
        } catch (e) {
          console.warn("[WARNING] Failed to parse final buffer:", buffer, e);
        }
      }

      // Final extraction of thinking content and cleaning
      const finalExtraction = extractThinkingContent(accumulatedResponse);
      cleanedText = finalExtraction.cleanedText;

      // Update final thinking state for this message
      if (finalExtraction.thinking) {
        // Use extracted thinking from the LLM response
        messageThinking.set(loadingMessageId, finalExtraction.thinking);
        currentThinking = finalExtraction.thinking;
      } else {
        // No thinking tags found - clear the placeholder so ThinkingSection doesn't show
        messageThinking.delete(loadingMessageId);
        currentThinking = "";
      }

      // CRITICAL: Always ensure final message state is not loading
      const finalContent = cleanedText.trim() || accumulatedResponse || "Response completed.";

      console.log("[FINAL] Setting final message state:", {
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
      console.error("[ERROR] Stream processing error:", error);
      throw error; // Re-throw to be handled by outer catch block
    } finally {
      console.log("[CLEANUP] Cleaning up stream resources");
      reader.releaseLock();
    }
  } catch (error) {
    console.error("[ERROR] Chat error:", error);
    let errorMessage =
      "I apologize, but I encountered an error processing your request. Please try again.";

    // Handle specific error types
    if (error instanceof Error && error.name === "AbortError") {
      // Check if it was a timeout or user-initiated abort
      if (abortController?.signal.reason === "timeout") {
        errorMessage = `Request timed out after ${CHAT_REQUEST_TIMEOUT / 1000} seconds. This usually happens with very complex queries. Please try:\n• A more specific question\n• Breaking your query into smaller parts\n• Limiting the scope (e.g., "top 5" instead of "all")`;
        console.log("[TIMEOUT] Request timed out");
      } else {
        errorMessage = "Request was cancelled by user.";
        console.log("[ABORT] Request was aborted by user");
      }
    } else if (error instanceof TypeError && error.message.includes("fetch")) {
      errorMessage =
        "Unable to connect to the chat service. Please check your internet connection and try again.";
    } else if (error.message?.includes("Failed to fetch")) {
      errorMessage = "Network error occurred. Please check your connection and try again.";
    }

    // Format error with warning icon
    const formattedError = `[WARNING] **Service Notice**\n\n${errorMessage}`;
    if (currentLoadingMessageId) {
      chatStore.updateMessage(currentLoadingMessageId, formattedError, false);
    }

    // Clear thinking on error - add small delay for smoother transition
    const errorThinking = `Error processing: "${userMessage}"\n\nEncountered an issue while processing your request.`;
    if (currentLoadingMessageId) {
      messageThinking.set(currentLoadingMessageId, errorThinking);
    }
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
    showProgress = false;
  }
}

// Handle feedback submission
async function _submitFeedback(messageId: string, score: -1 | 0 | 1) {
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
    console.log("Selecting new feedback for message:", messageId, "score:", score);
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
        userId: authStore.userAccount?.localAccountId || authStore.userAccount?.homeAccountId,
        userName: authStore.userAccount?.name,
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
        action: newScore === 1 ? "ThumbsUp" : newScore === -1 ? "ThumbsDown" : "Deselected",
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

function _startNewConversation() {
  if (browser && trackerReady) {
    trackEvent("User_Interaction", {
      type: "click",
      element: "ChatAssistant",
      action: "ClearConversation",
      page: "Document Search",
    });
  }

  chatStore.startNewConversation(authStore.userAccount?.name);

  // Clear thinking state and reset state machine
  setRequestState("idle");
  requestId = null;
  currentThinking = "";
  messageThinking.clear();
  extendedThinkingMessages.clear();
  messageProgress.clear();
}

$effect(() => {
  console.debug("[AI] Chat Assistant Status Changed:", {
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

    const scrollbarWidth = scrollDiv.offsetWidth - scrollDiv.clientWidth;
    document.documentElement.style.setProperty("--scrollbar-width", `${scrollbarWidth}px`);

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
  console.debug("[AI] Chat Assistant Visibility:", {
    isInitialized,
    pathname: page?.url?.pathname,
    isAuthenticated: authStore.isAuthenticated,
    timestamp: new Date().toISOString(),
  });
});
</script>

{#if page.url.pathname !== "/login" && authStore.isAuthenticated}
    <div
        class="fixed bottom-4 left-4 z-50 flex flex-col items-start space-y-4"
        class:chat-open={isOpen}
    >
        <button
            type="button"
            onclick={_toggleChat}
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
                onclick={_toggleChat}
                onkeydown={(e) => e.key === "Escape" && _toggleChat()}
                aria-label="Close chat overlay"
                data-transaction-name="Chat Assistant Close"
            ></button>

            <div
                class="fixed bottom-40 right-6 sm:right-4 sm:left-4 md:right-6 md:left-auto w-[800px] max-w-[calc(100vw-3rem)] xl:max-w-[calc(100vw-6rem)] sm:max-w-none md:max-w-[calc(100vw-3rem)] z-[46] rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900"
                role="dialog"
                aria-modal="true"
                aria-label="Chat window"
            >
                <div class="flex flex-col h-[80vh] max-h-[800px] min-h-[500px]">
                    <!-- Header -->
                    <div
                        class="flex items-center justify-between border-b border-gray-200 bg-[#00174f] p-4 dark:border-gray-800"
                    >
                        <div class="flex items-center gap-2">
                            <h2 class="font-bold text-white">Chat Assistant</h2>
                        </div>
                        <div class="flex items-center gap-4">
                            {#if _conversationSummary?.hasContext}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onclick={_startNewConversation}
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
                                onclick={_toggleChat}
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
                    {#if _conversationSummary}
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
                                                class="h-full transition-all duration-300 {_conversationSummary.contextPercentage >=
                                                90
                                                    ? 'bg-red-500'
                                                    : _conversationSummary.contextPercentage >=
                                                        80
                                                      ? 'bg-amber-500'
                                                      : 'bg-green-500'}"
                                                style="width: {_conversationSummary.contextPercentage}%"
                                            ></div>
                                        </div>
                                        <span
                                            class={_conversationSummary.contextPercentage >=
                                            90
                                                ? "text-red-600 dark:text-red-400 font-semibold"
                                                : _conversationSummary.contextPercentage >=
                                                    80
                                                  ? "text-amber-600 dark:text-amber-400"
                                                  : "text-gray-600 dark:text-gray-400"}
                                        >
                                            {_conversationSummary.messageCount}/{_conversationSummary.contextLimit}
                                            messages
                                        </span>
                                    </div>
                                </div>
                                <div class="flex items-center gap-3">
                                    {#if _conversationSummary.contextPercentage >= 80}
                                        <span
                                            class="text-amber-600 dark:text-amber-400"
                                        >
                                            {_conversationSummary.contextPercentage >=
                                            90
                                                ? "[WARNING] Near limit"
                                                : "[WARNING] Approaching limit"}
                                        </span>
                                    {/if}
                                    {#if _conversationSummary.isNearExpiry}
                                        <span
                                            class="text-red-600 dark:text-red-400 font-semibold"
                                        >
                                            [TIMEOUT] History expires in {Math.floor(
                                                _conversationSummary.remainingHours,
                                            )}h {Math.floor(
                                                (_conversationSummary.remainingHours %
                                                    1) *
                                                    60,
                                            )}m
                                        </span>
                                    {:else if _conversationSummary.ageInHours > 12}
                                        <span
                                            class="text-gray-500 dark:text-gray-500"
                                        >
                                            History expires in {Math.floor(
                                                _conversationSummary.remainingHours,
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
                                <div class="flex flex-col w-full max-w-[80%]">
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

                                    {#if message.type === "bot" && (message.isLoading || messageThinking.has(message.id))}
                                        <!-- AI Reasoning (collapsed by default, shows from start) -->
                                        <ThinkingSection
                                            isThinking={message.isLoading}
                                            thinkingText={messageThinking.get(message.id) || ""}
                                        />
                                    {/if}

                                    <!-- Progress tracking (shows during and after processing) -->
                                    {#if message.type === "bot" && (message.isLoading || messageProgress.has(message.id))}
                                        {@const progress = messageProgress.get(message.id) || { completedNodes: [], completedTools: [] }}
                                        <CompletedProgress
                                            completedNodes={progress.completedNodes}
                                            completedTools={progress.completedTools}
                                            activeNode={progress.activeNode}
                                            activeTool={progress.activeTool}
                                            isProcessing={message.isLoading}
                                            responseTime={progress.responseTime}
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
                                                        '[WARNING]',
                                                    )
                                                  ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
                                                  : 'bg-gray-100 dark:bg-gray-800'}"
                                        >
                                            <div
                                                class="prose prose-sm max-w-none dark:prose-invert prose-pre:bg-gray-900 prose-pre:text-gray-100 overflow-x-auto"
                                            >
                                                {#if message.type === "bot"}
                                                    {#if message.text.includes("References:")}
                                                        {@html _renderMarkdown(
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
                                                        {@html _renderMarkdown(
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
                                                            _submitFeedback(
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
                                                            _submitFeedback(
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
                                        src={_userPhoto}
                                        alt="User"
                                        class="w-8 h-8 rounded-full object-cover flex-shrink-0"
                                    />
                                {/if}
                            </div>
                        {/each}
                    </div>

                    <!-- Suggested Queries -->
                    {#if _showSuggestedQueries}
                        <SuggestedQueries
                            onQuerySelect={(query, useExtendedThinking) => {
                                newMessage = query;
                                enableExtendedThinking = useExtendedThinking || false;
                                _handleSubmit();
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
                                "[FORM] Form submitted, isLoading:",
                                isLoading,
                                "newMessage:",
                                newMessage,
                                "abortController:",
                                !!abortController,
                            );
                            if (isLoading && abortController) {
                                console.log(
                                    "[ABORT] Calling handleAbort from form submission",
                                );
                                _handleAbort();
                            } else if (!isLoading && newMessage.trim()) {
                                console.log(
                                    "[SUBMIT] Calling handleSubmit from form submission",
                                );
                                _handleSubmit();
                            } else {
                                console.log(
                                    "[WARNING] Form submitted but conditions not met",
                                );
                            }
                        }}
                        class="border-t border-gray-200 p-4 dark:border-gray-800"
                    >
                        <div class="flex gap-2">
                            <input
                                type="text"
                                bind:value={newMessage}
                                placeholder={_inputPlaceholder}
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
                                disabled={_isButtonDisabled}
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
