/* src/lib/services/bedrock-embedding.ts */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { log, err } from '$utils/unifiedLogger';

export class BedrockEmbeddingService {
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
      // Use HTTP/1.1 handler to avoid Bun HTTP/2 compatibility issues
      requestHandler: new NodeHttpHandler({
        httpAgent: { keepAlive: false },
        httpsAgent: { keepAlive: false }
      })
    });
    this.modelId = Bun.env.BEDROCK_EMBEDDING_MODEL || "amazon.titan-embed-text-v1";
  }

  // Function to estimate tokens (conservative approximation: 1 token ≈ 3 characters for safety)
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 3);
  }

  // Function to chunk text for embeddings
  private chunkText(text: string, maxTokens: number = 6000): string[] {
    const estimatedTokens = this.estimateTokens(text);
    
    if (estimatedTokens <= maxTokens) {
      return [text];
    }

    const chunks: string[] = [];
    const maxChars = maxTokens * 3; // Conservative character limit
    const sentences = text.split(/[.!?]+/);
    
    let currentChunk = "";
    
    for (const sentence of sentences) {
      const testChunk = currentChunk + (currentChunk ? ". " : "") + sentence.trim();
      
      if (testChunk.length <= maxChars) {
        currentChunk = testChunk;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = sentence.trim();
        } else {
          // Handle very long sentences by splitting by words
          const words = sentence.split(/\s+/);
          let wordChunk = "";
          for (const word of words) {
            const testWordChunk = wordChunk + (wordChunk ? " " : "") + word;
            if (testWordChunk.length <= maxChars) {
              wordChunk = testWordChunk;
            } else {
              if (wordChunk) {
                chunks.push(wordChunk.trim());
                wordChunk = word;
              } else {
                // Single word is too long, truncate it
                chunks.push(word.substring(0, maxChars));
              }
            }
          }
          currentChunk = wordChunk;
        }
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks.filter(chunk => chunk.length > 0);
  }

  // Function to create embeddings using AWS Bedrock
  async createEmbedding(text: string): Promise<number[]> {
    log('🚀 [BedrockEmbedding] createEmbedding called', { 
      textLength: text.length, 
      modelId: this.modelId 
    });

    try {
      const estimatedTokens = this.estimateTokens(text);
      log('🔢 [BedrockEmbedding] Token analysis', {
        textLength: text.length,
        estimatedTokens,
        exceedsLimit: estimatedTokens > 6000
      });
      
      // If text is too long, chunk it and average the embeddings
      if (estimatedTokens > 6000) {
        log('⚠️ [BedrockEmbedding] Text too long, chunking', { estimatedTokens });
        
        const chunks = this.chunkText(text, 6000);
        log('📊 [BedrockEmbedding] Chunking complete', { chunkCount: chunks.length });
        
        const chunkEmbeddings: number[][] = [];
        
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          log('🔄 [BedrockEmbedding] Processing chunk', { 
            chunkIndex: i + 1,
            totalChunks: chunks.length,
            chunkLength: chunk.length 
          });
          
          const requestBody = {
            inputText: chunk,
          };

          const command = new InvokeModelCommand({
            modelId: this.modelId,
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify(requestBody),
          });

          try {
            const response = await this.client.send(command);
            const responseBody = JSON.parse(new TextDecoder().decode(response.body));
            chunkEmbeddings.push(responseBody.embedding);
          } catch (chunkError) {
            err('❌ [BedrockEmbedding] Failed to process chunk', {
              chunkIndex: i + 1,
              error: chunkError.message
            });
            throw chunkError;
          }
          
          // Add small delay between requests
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Average the embeddings
        log('🧮 [BedrockEmbedding] Averaging embeddings', { 
          embeddingCount: chunkEmbeddings.length,
          dimensions: chunkEmbeddings[0].length
        });
        
        const avgEmbedding = new Array(chunkEmbeddings[0].length).fill(0);
        
        for (const embedding of chunkEmbeddings) {
          for (let i = 0; i < embedding.length; i++) {
            avgEmbedding[i] += embedding[i] / chunkEmbeddings.length;
          }
        }
        
        log('✅ [BedrockEmbedding] Averaged embedding created', { 
          dimensions: avgEmbedding.length 
        });
        return avgEmbedding;
      }
      
      // For normal-sized text, process directly
      log('🏗️ [BedrockEmbedding] Creating embedding for normal text', { 
        textLength: text.length 
      });
      
      const requestBody = {
        inputText: text,
      };

      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(requestBody),
      });

      let response;
      try {
        response = await this.client.send(command);
      } catch (sendError) {
        // Check if this is the HTTP/2 destructuring issue
        if (sendError.message && sendError.message.includes('Right side of assignment cannot be destructured')) {
          log('⚠️ [BedrockEmbedding] HTTP/2 destructuring issue during send, using fallback');
          return new Array(1536).fill(0); // Standard embedding dimension fallback
        }
        throw sendError;
      }
      
      // Check if response body exists and is valid
      if (!response.body) {
        throw new Error('Empty response body from Bedrock');
      }
      
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      log('✅ [BedrockEmbedding] Embedding created', { 
        dimensions: responseBody.embedding.length 
      });
      
      return responseBody.embedding;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check if this is the HTTP/2 destructuring issue
      if (errorMessage.includes('Right side of assignment cannot be destructured')) {
        err('❌ [BedrockEmbedding] HTTP/2 destructuring issue detected', {
          modelId: this.modelId,
          error: errorMessage,
          recommendation: 'Consider using HTTP/1.1 or different HTTP client'
        });
        
        // Return a zero vector as fallback to prevent total failure
        log('⚠️ [BedrockEmbedding] Returning zero vector as fallback');
        return new Array(1536).fill(0); // Standard embedding dimension
      }
      
      err('❌ [BedrockEmbedding] Failed to create embedding', {
        modelId: this.modelId,
        error: errorMessage
      });
      throw error;
    }
  }

  // Function to get LangChain-compatible embeddings
  getEmbeddings() {
    log('📏 [BedrockEmbedding] Initializing LangChain-compatible embeddings', { 
      modelId: this.modelId 
    });
    
    return {
      embedQuery: this.createEmbedding.bind(this),
      embedDocuments: async (texts: string[]) => {
        const embeddings = [];
        for (const text of texts) {
          const embedding = await this.createEmbedding(text);
          embeddings.push(embedding);
        }
        return embeddings;
      }
    };
  }
}