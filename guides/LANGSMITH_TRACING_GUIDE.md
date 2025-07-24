# Langsmith Distributed Tracing Implementation Guide

This document outlines the successful implementation of Langsmith distributed tracing for a RAG (Retrieval-Augmented Generation) application with proper parent-child trace relationships.

## Overview

Successfully implemented single conversation traces with nested child operations, eliminating the previous issue of multiple separate traces for a single conversation.

## Architecture Pattern

### Before (Broken)
```
- AWS Knowledge Base RAG Pipeline (separate trace)
- Response Stream Capture (separate trace)  
- Bedrock Chat Completion (separate trace)
```

### After (Fixed)
```
📊 Chat Conversation (main trace)
├── 🔍 Knowledge Base Retrieval (child)
├── ⚙️ Context Processing (child) 
├── 🤖 LLM Completion (child)
└── 🔧 Tool: get_system_nodes (child)
```

## Key Implementation Components

### 1. Main Conversation Trace (`/src/routes/api/chat/+server.ts`)

**Pattern:** Single top-level traceable wrapper for the entire conversation

```typescript
const processConversation = traceable(
  async (currentMessage: string, conversationMessages: any[], metadata: RAGMetadata, ragProvider: any) => {
    // Execute RAG query within conversation trace context
    const { stream, context } = await ragProvider.query(currentMessage, metadata);
    return { stream, context };
  },
  {
    run_type: "chain",
    name: "Chat Conversation",
  },
);
```

**Key Points:**
- Creates the top-level trace for each conversation turn
- All child operations inherit this context automatically
- Uses `run_type: "chain"` for the main orchestration trace

### 2. Metadata Structure for Thread Continuity

**Pattern:** Proper metadata passed as final parameter following Langsmith docs

```typescript
const { stream, context } = await processConversation(
  currentMessage, 
  conversationMessages, 
  metadata,
  ragProvider,
  {
    metadata: {
      session_id: sessionId,
      thread_id: conversationId,
      conversation_id: conversationId,
      user_id: user?.id || 'anonymous',
      message_count: metadata.messageCount,
    },
    tags: [
      "conversation",
      "chat-session",
      `user:${user?.id || 'anonymous'}`,
      `conversation:${conversationId}`,
    ],
  }
);
```

**Key Points:**
- Metadata passed as final parameter (not embedded in other objects)
- Session/thread IDs enable conversation continuity
- Tags provide additional filtering capabilities

### 3. Child Operation Tracing (`/src/lib/rag/providers/aws-knowledge-base.ts`)

**Pattern:** Individual traceable wrappers for each RAG step

```typescript
// Create child traceable operations that nest under the conversation trace
const tracedKnowledgeBaseRetrieval = traceable(
  this.knowledgeBaseRetrieval,
  {
    name: "Knowledge Base Retrieval",
    run_type: "retriever",
  }
);

const tracedContextProcessing = traceable(
  this.contextProcessing,
  {
    name: "Context Processing", 
    run_type: "chain",
  }
);

const tracedLLMCompletion = traceable(
  this.llmCompletion,
  {
    name: "LLM Completion",
    run_type: "llm",
  }
);
```

**Key Points:**
- Each RAG step gets its own traceable wrapper
- Proper `run_type` values: `"retriever"`, `"chain"`, `"llm"`, `"tool"`
- Functions automatically inherit parent trace context
- No need for manual trace header passing at this level

### 4. Tool Execution Tracing (`/src/lib/services/bedrock-chat.ts`)

**Pattern:** Traceable wrapper + withRunTree for proper nesting

```typescript
// Tool function wrapped with traceable
const executeSpecificTool = traceable(
  async (toolName: string, toolInput: any) => {
    // Tool execution logic...
    return result;
  },
  {
    name: `Tool: ${name}`,
    run_type: "tool",
  }
);

// Execute within parent trace context
if (currentRunTree) {
  return await withRunTree(currentRunTree, async () => {
    return await executeSpecificTool(name, input);
  });
} else {
  return await executeSpecificTool(name, input);
}
```

**Key Points:**
- Tools wrapped with `traceable()` for proper trace creation
- `withRunTree()` ensures execution within parent context
- `getCurrentRunTree()` retrieves current trace context
- Tool traces appear as children of the conversation

## Critical Success Factors

### ✅ Do's

1. **Single Top-Level Trace**: Use one main traceable wrapper per conversation turn
2. **Proper run_type Values**: 
   - `"chain"` for orchestration/workflow
   - `"retriever"` for document retrieval
   - `"llm"` for language model calls  
   - `"tool"` for function/tool execution
3. **Metadata Structure**: Pass metadata as final parameter with correct structure
4. **Child Operations**: Each major step gets its own traceable wrapper
5. **Tool Context**: Use `withRunTree()` for tool execution within parent context
6. **Thread Continuity**: Use consistent session_id, thread_id, conversation_id

### ❌ Don'ts

1. **Multiple Top-Level Traces**: Avoid separate traceable wrappers that create sibling traces
2. **Nested withRunTree()**: Don't double-wrap with both traceable() and withRunTree() at same level
3. **Metadata in Wrong Place**: Don't embed metadata in other objects
4. **Over-Engineering**: Keep the tracing simple and follow documented patterns
5. **Missing Context**: Don't lose trace context when crossing service boundaries

## Trace Header Propagation

When crossing service boundaries (e.g., RAG provider to chat service), trace headers are automatically generated and passed:

```typescript
// Headers automatically include trace context
const traceHeaders = {
  "langsmith-trace": "20250724T085439396001Zae05ae4c-c768-4072-b2e2-6ab3b21e5d2e.20250724T085439875004Zec1978e4-f4c2-4140-be01-37bf4e26e55d",
  "baggage": "langsmith-project=capella-document-search"
};

// BedrockChat service recreates RunTree from headers
const currentRun = RunTree.fromHeaders(traceHeaders);
```

## Debugging Tools

Add trace context debugging for troubleshooting:

```typescript
const { getCurrentRunTree } = await import("langsmith/traceable");
const currentRun = getCurrentRunTree();
log("🔍 [TRACE DEBUG] Current run tree:", {
  runId: currentRun?.id,
  runName: currentRun?.name,
  runType: currentRun?.run_type,
  hasParent: !!currentRun?.parent_run_id,
  parentId: currentRun?.parent_run_id,
});
```

## Best Practices

1. **Start Simple**: Begin with main conversation trace, add child traces incrementally
2. **Follow Documentation**: Langsmith patterns are well-documented, follow them exactly
3. **Test Incrementally**: Verify each level of tracing before adding complexity
4. **Debug Context**: Use getCurrentRunTree() to verify trace context at each step
5. **Consistent Naming**: Use clear, descriptive names for trace operations
6. **Proper Types**: Use correct run_type for semantic meaning in Langsmith UI

## Environment Setup

Ensure Langsmith is properly configured:

```typescript
// Environment variables
LANGCHAIN_TRACING_V2=true
LANGCHAIN_PROJECT=your-project-name
LANGCHAIN_API_KEY=your-api-key
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
```

## Common Issues & Solutions

### Issue: Separate Traces Instead of Nested
**Cause**: Multiple top-level traceable wrappers
**Solution**: Use single conversation-level trace with child operations

### Issue: Lost Trace Context
**Cause**: Not using withRunTree() for cross-boundary calls
**Solution**: Properly propagate context using getCurrentRunTree() and withRunTree()

### Issue: Metadata Not Visible
**Cause**: Incorrect metadata structure or placement
**Solution**: Pass metadata as final parameter with proper structure

### Issue: Tools Not Appearing as Children
**Cause**: Not executing within parent trace context
**Solution**: Use withRunTree() with parent context for tool execution

This implementation provides perfect observability for RAG pipelines while maintaining clean, maintainable code structure.