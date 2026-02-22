// src/lib/stores/chat.svelte.ts

import { browser } from "$app/environment";

export interface ChatMessage {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	timestamp: string;
	isLoading?: boolean;
	runId?: string;
	feedback?: {
		score: -1 | 0 | 1;
		submittedAt: string;
	};
}

export interface Conversation {
	id: string;
	messages: ChatMessage[];
	createdAt: string;
	updatedAt: string;
	title?: string;
}

const STORAGE_KEY = "capella-chat-conversation";
const MAX_CONVERSATION_AGE_HOURS = 24;
const MAX_CONTEXT_MESSAGES = 20;

function generateId(): string {
	return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function generateMessageId(): string {
	return `msg_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 5)}`;
}

function createChatStore() {
	let conversation = $state<Conversation | null>(null);

	function persistToStorage() {
		if (browser && conversation) {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(conversation));
		}
	}

	function createNewConversation(userName?: string): Conversation {
		return {
			id: generateId(),
			messages: [
				{
					id: generateMessageId(),
					role: "assistant",
					content: `Hello ${userName ? userName.split(" ")[0] : "there"}! How can I help you today?`,
					timestamp: new Date().toISOString(),
				},
			],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
	}

	return {
		get conversation() {
			return conversation;
		},

		initialize(userName?: string) {
			if (!browser) return;

			try {
				const stored = localStorage.getItem(STORAGE_KEY);
				if (stored) {
					const parsed: Conversation = JSON.parse(stored);
					const age = Date.now() - new Date(parsed.updatedAt).getTime();
					const maxAge = MAX_CONVERSATION_AGE_HOURS * 60 * 60 * 1000;

					if (age < maxAge) {
						conversation = parsed;
						return;
					}
				}
			} catch (error) {
				console.warn("Failed to restore conversation:", error);
			}

			conversation = createNewConversation(userName);
			persistToStorage();
		},

		addMessage(role: "user" | "assistant", content: string, isLoading = false): string {
			const message: ChatMessage = {
				id: generateMessageId(),
				role,
				content,
				timestamp: new Date().toISOString(),
				isLoading,
			};

			if (conversation) {
				conversation = {
					...conversation,
					messages: [...conversation.messages, message],
					updatedAt: new Date().toISOString(),
				};
				persistToStorage();
			}

			return message.id;
		},

		updateMessage(messageId: string, content: string, isLoading = false, runId?: string) {
			console.log("[Update] ChatStore: updateMessage called", {
				messageId,
				contentLength: content.length,
				isLoading,
				runId,
			});

			if (!conversation) {
				console.warn("[WARN] ChatStore: No conversation to update");
				return;
			}

			const messageFound = conversation.messages.find((msg) => msg.id === messageId);
			console.log("[Search] ChatStore: Message found for update:", !!messageFound);

			conversation = {
				...conversation,
				messages: conversation.messages.map((msg) =>
					msg.id === messageId
						? {
								...msg,
								content,
								isLoading,
								timestamp: new Date().toISOString(),
								...(runId && { runId }),
							}
						: msg
				),
				updatedAt: new Date().toISOString(),
			};

			console.log("[OK] ChatStore: Conversation updated", {
				messageCount: conversation.messages.length,
				updatedMessageContent: conversation.messages
					.find((m) => m.id === messageId)
					?.content?.substring(0, 100),
			});

			persistToStorage();
		},

		getMessagesForAPI(): Array<{ role: string; content: string }> {
			if (!conversation) return [];

			let validMessages = conversation.messages.filter(
				(msg) => !msg.isLoading && msg.role !== "system"
			);

			const firstUserIndex = validMessages.findIndex((msg) => msg.role === "user");
			if (firstUserIndex === -1) {
				return [];
			}

			validMessages = validMessages.slice(firstUserIndex);
			validMessages = validMessages.slice(-MAX_CONTEXT_MESSAGES);

			return validMessages.map((msg) => ({
				role: msg.role,
				content: msg.content,
			}));
		},

		getConversationSummary() {
			if (!conversation) return null;

			const userMessages = conversation.messages.filter(
				(msg) => !msg.isLoading && msg.role === "user"
			);
			const messageCount = userMessages.length;

			const conversationAge = Date.now() - new Date(conversation.createdAt).getTime();
			const ageInHours = conversationAge / (1000 * 60 * 60);
			const remainingHours = Math.max(0, MAX_CONVERSATION_AGE_HOURS - ageInHours);
			const isNearExpiry = remainingHours <= 2;
			const isExpired = remainingHours <= 0;

			return {
				messageCount,
				lastUpdated: conversation.updatedAt,
				hasContext: messageCount > 0,
				contextLimit: MAX_CONTEXT_MESSAGES,
				contextPercentage: Math.round((messageCount / MAX_CONTEXT_MESSAGES) * 100),
				isNearLimit: messageCount >= MAX_CONTEXT_MESSAGES * 0.8,
				isAtLimit: messageCount >= MAX_CONTEXT_MESSAGES * 0.9,
				ageInHours,
				remainingHours,
				isNearExpiry,
				isExpired,
			};
		},

		clearConversation(userName?: string) {
			if (browser) {
				localStorage.removeItem(STORAGE_KEY);
			}
			conversation = createNewConversation(userName);
			persistToStorage();
		},

		startNewConversation(userName?: string) {
			if (browser) {
				localStorage.removeItem(STORAGE_KEY);
			}
			conversation = createNewConversation(userName);
			persistToStorage();
		},

		exportConversation() {
			if (!conversation) return null;
			return {
				...conversation,
				exportedAt: new Date().toISOString(),
			};
		},

		isNearContextLimit(): boolean {
			if (!conversation) return false;
			return (
				conversation.messages.filter((msg) => !msg.isLoading).length > MAX_CONTEXT_MESSAGES * 0.8
			);
		},

		updateFeedback(messageId: string, score: -1 | 0 | 1) {
			console.log("[Feedback] ChatStore: updateFeedback called", { messageId, score });

			if (!conversation) {
				console.warn("[WARN] ChatStore: No conversation to update feedback");
				return;
			}

			conversation = {
				...conversation,
				messages: conversation.messages.map((msg) =>
					msg.id === messageId
						? {
								...msg,
								feedback: {
									score,
									submittedAt: new Date().toISOString(),
								},
							}
						: msg
				),
				updatedAt: new Date().toISOString(),
			};

			persistToStorage();
		},
	};
}

export const chatStore = createChatStore();

export function formatMessagesForDisplay(conversation: Conversation | null): Array<{
	id: string;
	type: "user" | "bot";
	text: string;
	timestamp?: string;
	isLoading?: boolean;
	runId?: string;
	feedback?: { score: -1 | 0 | 1; submittedAt: string };
}> {
	if (!conversation) return [];

	return conversation.messages.map((msg) => ({
		id: msg.id,
		type: msg.role === "user" ? "user" : "bot",
		text: msg.content,
		timestamp: msg.timestamp,
		isLoading: msg.isLoading,
		runId: msg.runId,
		feedback: msg.feedback,
	}));
}
