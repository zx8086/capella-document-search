/* src/lib/services/bedrock-chat.ts */

import {
  BedrockRuntimeClient,
  InvokeModelWithResponseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { log, err } from '$utils/unifiedLogger';

export class BedrockChatService {
  private client: BedrockRuntimeClient;
  private modelId: string;

  constructor(region: string = "eu-central-1") {
    this.client = new BedrockRuntimeClient({
      region,
      credentials: {
        accessKeyId: Bun.env.AWS_ACCESS_KEY_ID || "DUMMY",
        secretAccessKey: Bun.env.AWS_SECRET_ACCESS_KEY || "DUMMY",
        sessionToken: Bun.env.AWS_BEARER_TOKEN_BEDROCK,
      },
    });
    this.modelId = Bun.env.BEDROCK_CHAT_MODEL || "anthropic.claude-3-5-sonnet-20240620-v1:0";
  }

  // Function to create a streaming chat completion - simplified approach
  async *createChatCompletion(
    messages: Array<{ role: string; content: string }>,
    options: {
      temperature?: number;
      max_tokens?: number;
    } = {}
  ): AsyncGenerator<string, void, unknown> {
    try {
      // Convert messages to Claude format
      const systemMessages = messages.filter(m => m.role === 'system');
      const conversationMessages = messages.filter(m => m.role !== 'system');

      // Combine system messages
      const systemPrompt = systemMessages.map(m => m.content).join('\n\n');

      // Convert conversation messages to Claude format
      const claudeMessages = conversationMessages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      }));

      const requestBody = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: options.max_tokens || 2000,
        temperature: options.temperature || 0.7,
        messages: claudeMessages,
        ...(systemPrompt && { system: systemPrompt })
      };

      const command = new InvokeModelWithResponseStreamCommand({
        modelId: this.modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(requestBody),
      });

      const response = await this.client.send(command);

      if (!response.body) {
        throw new Error('No response body received from Bedrock');
      }

      // Collect all chunks first to avoid Bun segmentation fault
      let fullResponse = '';
      
      try {
        for await (const chunk of response.body!) {
          if (chunk.chunk?.bytes) {
            const chunkData = JSON.parse(new TextDecoder().decode(chunk.chunk.bytes));
            
            if (chunkData.type === 'content_block_delta' && chunkData.delta?.text) {
              fullResponse += chunkData.delta.text;
            } else if (chunkData.type === 'message_stop') {
              break;
            }
          }
        }
      } catch (streamError) {
        log('⚠️ [BedrockChat] Stream processing warning:', { error: streamError.message });
      }
      
      // Yield complete response to avoid async generator issues
      if (fullResponse) {
        yield fullResponse;
      }
    } catch (error) {
      err('❌ [BedrockChat] Failed to create chat completion', {
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