/* src/lib/stores/chatStore.ts */

import { browser } from '$app/environment';
import { writable, get } from 'svelte/store';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  isLoading?: boolean;
}

export interface Conversation {
  id: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  title?: string;
}

const STORAGE_KEY = 'capella-chat-conversation';
const MAX_CONVERSATION_AGE_HOURS = 24;
const MAX_CONTEXT_MESSAGES = 20; // Limit for context window management

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function generateMessageId(): string {
  return 'msg_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function createChatStore() {
  const { subscribe, set, update } = writable<Conversation | null>(null);

  return {
    subscribe,

    // Initialize or restore conversation
    initialize: (userName?: string) => {
      if (!browser) return;
      
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const conversation: Conversation = JSON.parse(stored);
          
          // Check if conversation is still valid (not too old)
          const age = Date.now() - new Date(conversation.updatedAt).getTime();
          const maxAge = MAX_CONVERSATION_AGE_HOURS * 60 * 60 * 1000;
          
          if (age < maxAge) {
            set(conversation);
            return;
          }
        }
      } catch (error) {
        console.warn('Failed to restore conversation:', error);
      }

      // Create new conversation
      const newConversation: Conversation = {
        id: generateId(),
        messages: [{
          id: generateMessageId(),
          role: 'assistant',
          content: `Hello ${userName ? userName.split(' ')[0] : 'there'}! How can I help you today?`,
          timestamp: new Date().toISOString()
        }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      set(newConversation);
      if (browser) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newConversation));
      }
    },

    // Add a message to the conversation
    addMessage: (role: 'user' | 'assistant', content: string, isLoading = false) => {
      const message: ChatMessage = {
        id: generateMessageId(),
        role,
        content,
        timestamp: new Date().toISOString(),
        isLoading
      };

      update(conversation => {
        if (!conversation) return conversation;

        const updated = {
          ...conversation,
          messages: [...conversation.messages, message],
          updatedAt: new Date().toISOString()
        };

        if (browser) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        }

        return updated;
      });

      return message.id;
    },

    // Update a specific message (useful for streaming responses)
    updateMessage: (messageId: string, content: string, isLoading = false) => {
      console.log('🔄 ChatStore: updateMessage called', { messageId, contentLength: content.length, isLoading });
      
      update(conversation => {
        if (!conversation) {
          console.warn('⚠️ ChatStore: No conversation to update');
          return conversation;
        }

        const messageFound = conversation.messages.find(msg => msg.id === messageId);
        console.log('🔍 ChatStore: Message found for update:', !!messageFound);

        const updated = {
          ...conversation,
          messages: conversation.messages.map(msg =>
            msg.id === messageId 
              ? { ...msg, content, isLoading, timestamp: new Date().toISOString() }
              : msg
          ),
          updatedAt: new Date().toISOString()
        };

        console.log('✅ ChatStore: Conversation updated', { 
          messageCount: updated.messages.length,
          updatedMessageContent: updated.messages.find(m => m.id === messageId)?.content?.substring(0, 100)
        });

        if (browser) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        }

        return updated;
      });
    },

    // Get messages formatted for API (role/content format)
    getMessagesForAPI: (): Array<{ role: string; content: string }> => {
      const conversation = get({ subscribe });
      if (!conversation) return [];

      // Filter out loading and system messages
      let validMessages = conversation.messages
        .filter(msg => !msg.isLoading && msg.role !== 'system');
      
      // AWS Bedrock requirement: conversation must start with a user message
      // Find the first user message and start from there
      const firstUserIndex = validMessages.findIndex(msg => msg.role === 'user');
      if (firstUserIndex === -1) {
        // No user messages yet
        return [];
      }
      
      // Start from the first user message to ensure proper conversation structure
      validMessages = validMessages.slice(firstUserIndex);
      
      // Apply context limit
      validMessages = validMessages.slice(-MAX_CONTEXT_MESSAGES);

      return validMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
    },

    // Get conversation summary for display
    getConversationSummary: () => {
      const conversation = get({ subscribe });
      if (!conversation) return null;

      // Count only user messages as they represent actual conversation turns
      const userMessages = conversation.messages.filter(msg => !msg.isLoading && msg.role === 'user');
      const messageCount = userMessages.length;

      return {
        messageCount,
        lastUpdated: conversation.updatedAt,
        hasContext: messageCount > 0,
        contextLimit: MAX_CONTEXT_MESSAGES,
        contextPercentage: Math.round((messageCount / MAX_CONTEXT_MESSAGES) * 100),
        isNearLimit: messageCount >= MAX_CONTEXT_MESSAGES * 0.8,
        isAtLimit: messageCount >= MAX_CONTEXT_MESSAGES * 0.9
      };
    },

    // Clear the current conversation
    clearConversation: (userName?: string) => {
      if (browser) {
        localStorage.removeItem(STORAGE_KEY);
      }

      // Create fresh conversation
      const newConversation: Conversation = {
        id: generateId(),
        messages: [{
          id: generateMessageId(),
          role: 'assistant',
          content: `Hello ${userName ? userName.split(' ')[0] : 'there'}! How can I help you today?`,
          timestamp: new Date().toISOString()
        }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      set(newConversation);
      if (browser) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newConversation));
      }
    },

    // Start a new conversation (alias for clearConversation with better naming)
    startNewConversation: (userName?: string) => {
      if (browser) {
        localStorage.removeItem(STORAGE_KEY);
      }

      // Create fresh conversation
      const newConversation: Conversation = {
        id: generateId(),
        messages: [{
          id: generateMessageId(),
          role: 'assistant',
          content: `Hello ${userName ? userName.split(' ')[0] : 'there'}! How can I help you today?`,
          timestamp: new Date().toISOString()
        }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      set(newConversation);
      if (browser) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newConversation));
      }
    },

    // Export conversation (future feature)
    exportConversation: () => {
      const conversation = get({ subscribe });
      if (!conversation) return null;

      return {
        ...conversation,
        exportedAt: new Date().toISOString()
      };
    },

    // Check if we're approaching context limits
    isNearContextLimit: (): boolean => {
      const conversation = get({ subscribe });
      if (!conversation) return false;
      
      return conversation.messages.filter(msg => !msg.isLoading).length > MAX_CONTEXT_MESSAGES * 0.8;
    }
  };
}

export const chatStore = createChatStore();

// Helper function to format messages for display (compatible with existing ChatbotPopup)
export function formatMessagesForDisplay(conversation: Conversation | null): Array<{ id: string; type: 'user' | 'bot'; text: string; isLoading?: boolean }> {
  if (!conversation) return [];

  return conversation.messages.map(msg => ({
    id: msg.id,
    type: msg.role === 'user' ? 'user' : 'bot',
    text: msg.content,
    isLoading: msg.isLoading
  }));
}