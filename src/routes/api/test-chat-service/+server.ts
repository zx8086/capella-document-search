/* Test Chat Service Constructor */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { clusterConn } from "$lib/couchbaseConnector";
import { backendConfig } from "../../../backend-config";
import { log, err } from "$utils/unifiedLogger";
import { BedrockChatService } from "../../../lib/services/bedrock-chat";

export const GET: RequestHandler = async () => {
  try {
    log("🧪 [TestChatService] Starting chat service constructor test");
    
    // Get cluster and bucket (same as working test)
    const cluster = await clusterConn();
    const bucket = cluster.bucket(backendConfig.capella.BUCKET);
    
    log("✅ [TestChatService] Got bucket, testing constructor");
    
    // Test constructor directly
    const chatService = new BedrockChatService("eu-central-1", bucket);
    
    log("✅ [TestChatService] Constructor completed");
    
    // Test tool execution directly
    log("🔧 [TestChatService] Testing tool execution");
    const toolResult = await (chatService as any).executeGetSystemVitals();
    
    return json({
      success: true,
      constructorWorked: true,
      toolResult: {
        success: toolResult.success,
        hasContent: !!toolResult.content,
        contentLength: toolResult.content?.length || 0
      }
    });
    
  } catch (error) {
    err("❌ [TestChatService] Test failed", { 
      error: error.message,
      stack: error.stack 
    });
    
    return json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
};