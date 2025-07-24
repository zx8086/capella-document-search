// Test file to demonstrate proper Langsmith tracing pattern

import { traceable } from "langsmith/traceable";

// Main conversation handler - creates top-level trace
const handleConversation = traceable(
  async (message: string, sessionId: string) => {
    console.log("Processing conversation:", message);
    
    // Child operation 1 - will appear as child trace
    const context = await retrieveContext(message);
    
    // Child operation 2 - will appear as child trace
    const response = await generateResponse(message, context);
    
    return response;
  },
  {
    name: "Conversation",
    run_type: "chain",
  }
);

// Child operations - these will be nested under the conversation
const retrieveContext = traceable(
  async (query: string) => {
    console.log("Retrieving context for:", query);
    // Simulate retrieval
    return ["context1", "context2"];
  },
  {
    name: "Context Retrieval",
    run_type: "retriever",
  }
);

const generateResponse = traceable(
  async (query: string, context: string[]) => {
    console.log("Generating response with context:", context);
    
    // Tool execution - will appear as child trace
    if (query.includes("nodes")) {
      const nodeData = await checkNodes();
      return `Node status: ${JSON.stringify(nodeData)}`;
    }
    
    return "Response based on context";
  },
  {
    name: "Response Generation",
    run_type: "llm",
  }
);

// Tool execution - will be nested under response generation
const checkNodes = traceable(
  async () => {
    console.log("Checking node status...");
    return { nodes: 5, status: "healthy" };
  },
  {
    name: "Check Nodes Tool",
    run_type: "tool",
  }
);

// Usage with proper metadata for thread continuity
async function main() {
  const sessionId = "session-123";
  const conversationId = "conv-456";
  
  // First message in conversation
  await handleConversation("How are my nodes?", sessionId, {
    metadata: {
      session_id: sessionId,
      thread_id: conversationId,
      conversation_id: conversationId,
    },
    tags: ["test-conversation"],
  });
  
  // Second message in same conversation
  await handleConversation("Tell me more", sessionId, {
    metadata: {
      session_id: sessionId,
      thread_id: conversationId,
      conversation_id: conversationId,
    },
    tags: ["test-conversation"],
  });
}

/*
This pattern ensures:
1. One top-level trace per conversation turn
2. All operations are nested as children
3. Thread continuity via session_id metadata
4. Tools appear as child traces
*/