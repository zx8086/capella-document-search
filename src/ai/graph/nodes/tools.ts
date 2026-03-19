// src/ai/graph/nodes/tools.ts

import { ToolMessage } from "@langchain/core/messages";
import { getConnectionStatus } from "$lib/couchbaseConnector";
import { err, log } from "$utils/unifiedLogger";
import { toolsByName } from "../../tools";
import type { AgentStateType, ToolResult } from "../state";

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  id: string;
}

// Track whether a Couchbase connection failure has occurred during this
// tools node invocation. When the first tool hits a connection error,
// remaining tools skip the 10s timeout and fail immediately.
function isCouchbaseConnectionError(errorStr: string): boolean {
  return /circuit breaker open|unambiguous.?timeout|ECONNREFUSED|connection.?failed/i.test(
    errorStr
  );
}

export async function toolsNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const lastMessage = state.messages[state.messages.length - 1];

  // Check for tool_calls property directly instead of instanceof
  // LangGraph may return messages that don't pass instanceof checks
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolCalls = (lastMessage as any)?.tool_calls as ToolCall[] | undefined;

  if (!toolCalls || toolCalls.length === 0) {
    log("[Tools] No tool calls found in last message", {
      hasMessage: !!lastMessage,
      messageType: lastMessage?.constructor?.name,
    });
    return {};
  }

  const toolMessages: ToolMessage[] = [];
  const newToolResults: ToolResult[] = [];

  log("[Tools] Processing tool calls", {
    toolCallCount: toolCalls.length,
    tools: toolCalls.map((tc) => tc.name),
  });

  // Track if Couchbase became unreachable during this batch
  let couchbaseDown = false;
  let couchbaseError = "";

  // Check circuit breaker state before executing any tools
  const connStatus = getConnectionStatus();
  if (connStatus.circuitOpen) {
    couchbaseDown = true;
    couchbaseError = connStatus.lastError || "Couchbase cluster unreachable";
    log("[Tools] Circuit breaker is open, Couchbase tools will fail fast", {
      lastError: connStatus.lastError,
    });
  }

  for (const toolCall of toolCalls) {
    const toolName = toolCall.name;
    const toolInput = toolCall.args;
    const toolCallId = toolCall.id;

    const startTime = Date.now();

    try {
      const tool = toolsByName[toolName];

      if (!tool) {
        const errorContent = JSON.stringify({
          success: false,
          error: `Unknown tool: ${toolName}`,
          availableTools: Object.keys(toolsByName),
        });

        toolMessages.push(
          new ToolMessage({
            content: errorContent,
            tool_call_id: toolCallId,
            name: toolName,
          })
        );

        newToolResults.push({
          toolName,
          success: false,
          content: errorContent,
          executionTimeMs: Date.now() - startTime,
        });

        continue;
      }

      // Short-circuit: if Couchbase is down, skip execution and fail fast.
      // This avoids burning 10s per tool waiting for the same dead connection.
      if (couchbaseDown) {
        const failFastMsg = `Couchbase cluster is unreachable. Skipping ${toolName} to avoid unnecessary delay. Error: ${couchbaseError}. All database tools will fail until the connection is restored.`;
        log("[Tools] Skipping tool due to Couchbase unavailability", { toolName });

        const errorContent = JSON.stringify({
          success: false,
          toolName,
          error: failFastMsg,
          executionTimeMs: 0,
          skippedReason: "couchbase_unavailable",
        });

        toolMessages.push(
          new ToolMessage({
            content: errorContent,
            tool_call_id: toolCallId,
            name: toolName,
          })
        );

        newToolResults.push({
          toolName,
          success: false,
          content: errorContent,
          executionTimeMs: 0,
        });

        continue;
      }

      log("[Tools] Executing tool", {
        toolName,
        inputKeys: Object.keys(toolInput || {}),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (tool as any).invoke(toolInput);
      const executionTime = Date.now() - startTime;

      log("[Tools] Tool execution complete", {
        toolName,
        executionTimeMs: executionTime,
        resultLength: typeof result === "string" ? result.length : 0,
      });

      const resultStr = typeof result === "string" ? result : JSON.stringify(result);

      // Check if this tool result indicates a Couchbase connection failure.
      // If so, mark Couchbase as down so subsequent tools in this batch fail fast.
      try {
        const parsed = JSON.parse(resultStr);
        if (
          !parsed.success &&
          parsed.data?.error &&
          isCouchbaseConnectionError(parsed.data.error)
        ) {
          couchbaseDown = true;
          couchbaseError = parsed.data.error;
          log("[Tools] Couchbase connection failure detected, remaining tools will fail fast", {
            toolName,
            error: parsed.data.error,
          });
        }
      } catch {
        // Not JSON or parse error, continue normally
      }

      toolMessages.push(
        new ToolMessage({
          content: resultStr,
          tool_call_id: toolCallId,
          name: toolName,
        })
      );

      // Parse result to extract success status
      let success = true;
      let data: Record<string, unknown> | undefined;

      try {
        const parsed = JSON.parse(resultStr);
        success = parsed.success !== false;
        data = parsed.data;
      } catch {
        // If not JSON, assume success if no error keywords
        success = !resultStr.toLowerCase().includes("error");
      }

      newToolResults.push({
        toolName,
        success,
        content: resultStr,
        data,
        executionTimeMs: executionTime,
      });
    } catch (e) {
      const executionTime = Date.now() - startTime;
      const errorMessage = e instanceof Error ? e.message : String(e);

      err("[Tools] Tool execution failed", {
        toolName,
        error: errorMessage,
        executionTimeMs: executionTime,
      });

      // Check if this is a Couchbase connection error
      if (isCouchbaseConnectionError(errorMessage)) {
        couchbaseDown = true;
        couchbaseError = errorMessage;
        log(
          "[Tools] Couchbase connection failure detected from exception, remaining tools will fail fast",
          {
            toolName,
          }
        );
      }

      const errorContent = JSON.stringify({
        success: false,
        toolName,
        error: errorMessage,
        executionTimeMs: executionTime,
      });

      toolMessages.push(
        new ToolMessage({
          content: errorContent,
          tool_call_id: toolCallId,
          name: toolName,
        })
      );

      newToolResults.push({
        toolName,
        success: false,
        content: errorContent,
        executionTimeMs: executionTime,
      });
    }
  }

  return {
    messages: toolMessages,
    toolResults: newToolResults,
  };
}
