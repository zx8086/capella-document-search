/* src/lib/services/bedrock-chat.ts */

import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { Message, ContentBlock } from "@aws-sdk/client-bedrock-runtime";
import { log, err } from '$utils/unifiedLogger';

export class BedrockChatService {
  private client: BedrockRuntimeClient;
  private modelId: string;

  constructor(region: string = "eu-central-1") {
    // Build credentials object safely
    const credentials: any = {
      accessKeyId: Bun.env.AWS_ACCESS_KEY_ID || "DUMMY",
      secretAccessKey: Bun.env.AWS_SECRET_ACCESS_KEY || "DUMMY",
    };
    
    // Only add sessionToken if it exists and is not empty
    if (Bun.env.AWS_BEARER_TOKEN_BEDROCK && Bun.env.AWS_BEARER_TOKEN_BEDROCK.trim()) {
      credentials.sessionToken = Bun.env.AWS_BEARER_TOKEN_BEDROCK;
    }
    
    this.client = new BedrockRuntimeClient({
      region,
      credentials,
      // Use maxAttempts to handle transient network issues
      maxAttempts: 3,
      // Add retry configuration
      retryMode: 'adaptive',
    });
    this.modelId = Bun.env.BEDROCK_CHAT_MODEL || "anthropic.claude-3-5-sonnet-20240620-v1:0";
  }

  // Function to create a streaming chat completion using Converse API
  async *createChatCompletion(
    messages: Array<{ role: string; content: string }>,
    options: {
      temperature?: number;
      max_tokens?: number;
    } = {}
  ): AsyncGenerator<string, void, unknown> {
    try {
      // Separate system messages from conversation messages
      const systemMessages = messages.filter(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      // Combine system messages
      const systemPrompt = systemMessages.map(m => m.content).join('\n\n');

      // Convert conversation messages to Converse API format
      const converseMessages: Message[] = conversationMessages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: [
          {
            text: msg.content
          }
        ]
      }));

      // Create the ConverseStream command
      const command = new ConverseStreamCommand({
        modelId: this.modelId,
        messages: converseMessages,
        system: systemPrompt ? [{ text: systemPrompt }] : undefined,
        inferenceConfig: {
          maxTokens: options.max_tokens || 2000,
          temperature: options.temperature || 0.7,
        },
      });

      log('🚀 [BedrockChat] Starting Converse stream', {
        modelId: this.modelId,
        messagesCount: converseMessages.length,
        hasSystem: !!systemPrompt
      });

      let response;
      try {
        response = await this.client.send(command);
      } catch (sendError) {
        // Check if this is the HTTP/2 destructuring issue
        if (sendError.message && sendError.message.includes('Right side of assignment cannot be destructured')) {
          err('❌ [BedrockChat] HTTP/2 destructuring issue during send', {
            modelId: this.modelId,
            error: sendError.message
          });
          yield '❌ Error: HTTP/2 compatibility issue with AWS SDK. Please try again.';
          return;
        }
        throw sendError;
      }

      if (!response.stream) {
        throw new Error('No response stream received from Bedrock Converse API');
      }

      // Stream chunks in real-time for typewriting effect
      let chunkCount = 0;
      
      try {
        for await (const chunk of response.stream) {
          if (chunk.contentBlockDelta?.delta?.text) {
            chunkCount++;
            // Yield each chunk immediately for real-time streaming
            yield chunk.contentBlockDelta.delta.text;
            
            // Small delay between chunks for smooth typewriting effect
            // Note: Commenting out delay due to Bun compatibility issues
            // The natural network latency provides sufficient delay
            // if (chunkCount < 50) {
            //   await new Promise(resolve => setTimeout(resolve, 30));
            // }
          } else if (chunk.messageStop) {
            log('✅ [BedrockChat] Converse stream completed', {
              totalChunks: chunkCount
            });
            break;
          }
        }
      } catch (streamError) {
        log('⚠️ [BedrockChat] Stream processing warning:', { error: streamError.message });
      }
    } catch (error) {
      err('❌ [BedrockChat] Failed to create chat completion with Converse API', {
        modelId: this.modelId,
        error: error.message
      });
      throw error;
    }
  }

  // Function to get model information
  getModelInfo() {
    return {
      provider: "AWS Bedrock",
      model: this.modelId
    };
  }

  // OpenAI-compatible interface for easy migration
  get chat() {
    return {
      completions: {
        create: (options: {
          model: string;
          messages: Array<{ role: string; content: string }>;
          temperature?: number;
          max_tokens?: number;
          stream?: boolean;
        }) => {
          if (!options.stream) {
            throw new Error('Non-streaming chat completions not yet supported');
          }

          return this.createChatCompletion(options.messages, {
            temperature: options.temperature,
            max_tokens: options.max_tokens
          });
        }
      }
    };
  }
}