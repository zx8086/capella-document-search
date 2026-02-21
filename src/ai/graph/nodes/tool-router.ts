// src/ai/graph/nodes/tool-router.ts

import { log } from "$utils/unifiedLogger";
import type { AgentStateType } from "../state";

// Tool selection patterns based on query keywords
const TOOL_PATTERNS: { pattern: RegExp; tools: string[] }[] = [
  // Cluster monitoring
  {
    pattern: /\b(vital|cpu|memory|disk|health|status)\b/i,
    tools: ["get_system_vitals"],
  },
  {
    pattern: /\b(node|cluster|topology|service)\b/i,
    tools: ["get_system_nodes"],
  },

  // Query analysis
  {
    pattern: /\b(fatal|error|fail|timeout)\b/i,
    tools: ["get_fatal_requests"],
  },
  {
    pattern: /\b(expensive|cost|resource)\b/i,
    tools: ["get_most_expensive_queries"],
  },
  {
    pattern: /\b(slow|long.?running|duration)\b/i,
    tools: ["get_longest_running_queries"],
  },
  {
    pattern: /\b(frequent|common|popular|hot)\b/i,
    tools: ["get_most_frequent_queries"],
  },
  {
    pattern: /\b(large.?result|big.?result|result.?size)\b/i,
    tools: ["get_largest_result_size_queries"],
  },
  {
    pattern: /\b(result.?count|many.?results|document.?count)\b/i,
    tools: ["get_largest_result_count_queries"],
  },
  {
    pattern: /\b(primary.?index|full.?scan)\b/i,
    tools: ["get_primary_index_queries"],
  },
  {
    pattern: /\b(completed|history|recent)\b/i,
    tools: ["get_completed_requests"],
  },

  // Index analysis
  {
    pattern: /\b(index|indexes)\b/i,
    tools: ["get_system_indexes", "get_detailed_indexes"],
  },
  {
    pattern: /\b(prepared|statement)\b/i,
    tools: ["get_prepared_statements", "get_detailed_prepared_statements"],
  },
  {
    pattern: /\b(unused|drop|remove|cleanup)\b/i,
    tools: ["get_indexes_to_drop"],
  },

  // Schema tools
  {
    pattern: /\b(schema|structure|field|document.?type)\b/i,
    tools: ["get_schema_for_collection"],
  },
  {
    pattern: /\b(query|select|sql\+\+|n1ql)\b/i,
    tools: ["run_sql_plus_plus_query"],
  },
];

// Tools that don't require specific context
const GENERAL_DIAGNOSTIC_TOOLS = ["get_system_vitals", "get_system_nodes", "get_system_indexes"];

function extractQueryFromMessages(messages: AgentStateType["messages"]): string {
  const lastMessage = messages[messages.length - 1];
  if (lastMessage && "content" in lastMessage) {
    const content = lastMessage.content;
    if (typeof content === "string") {
      return content;
    }
    if (Array.isArray(content)) {
      return content.map((c) => (typeof c === "string" ? c : c.text || "")).join(" ");
    }
  }
  return "";
}

export async function toolRouterNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const query = extractQueryFromMessages(state.messages);

  if (!query) {
    log("[ToolRouter] No query found, selecting general diagnostics");
    return { selectedTools: GENERAL_DIAGNOSTIC_TOOLS };
  }

  const selectedTools = new Set<string>();

  // Match patterns to select tools
  for (const { pattern, tools } of TOOL_PATTERNS) {
    if (pattern.test(query)) {
      for (const tool of tools) {
        selectedTools.add(tool);
      }
    }
  }

  // If no specific tools matched, select general diagnostics
  if (selectedTools.size === 0) {
    log("[ToolRouter] No specific tools matched, using general diagnostics");
    for (const tool of GENERAL_DIAGNOSTIC_TOOLS) {
      selectedTools.add(tool);
    }
  }

  const toolList = Array.from(selectedTools);

  log("[ToolRouter] Tools selected", {
    query: query.substring(0, 50),
    selectedTools: toolList,
    toolCount: toolList.length,
  });

  return { selectedTools: toolList };
}

export function shouldUseTool(state: AgentStateType): "agent" | "responder" {
  // If we have selected tools and classification is complex, route to agent
  if (state.queryClassification === "complex" && state.selectedTools.length > 0) {
    return "agent";
  }

  // Otherwise go directly to responder
  return "responder";
}
