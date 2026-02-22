# LangGraph + LangChain + AWS Bedrock Implementation Guide

**Based on: AWS Cost Analyzer Reference Architecture**
**Stack: Bun + TypeScript + LangGraph + AWS Bedrock (Claude)**

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Package Installation](#2-package-installation)
3. [Project Structure](#3-project-structure)
4. [Configuration & Credentials](#4-configuration--credentials)
5. [LangGraph Workflow (Graph Definition)](#5-langgraph-workflow-graph-definition)
6. [Graph Nodes (Step by Step)](#6-graph-nodes-step-by-step)
7. [Tool System](#7-tool-system)
8. [Shared Schemas & Helpers](#8-shared-schemas--helpers)
9. [Bedrock Client Setup](#9-bedrock-client-setup)
10. [API Layer (HTTP + Streaming)](#10-api-layer-http--streaming)
11. [LangSmith Observability](#11-langsmith-observability)
12. [Entity Inheritance (Multi-turn Context)](#12-entity-inheritance-multi-turn-context)
13. [Checklist for New Projects](#13-checklist-for-new-projects)

---

## 1. Architecture Overview

The pattern follows a **7-node LangGraph workflow** with deterministic routing, parallel tool execution, and progressive token streaming:

```
User Query
    │
    ▼
┌──────────┐
│ classify  │ ← Routes simple vs complex queries
└────┬─────┘
     ▼
┌──────────────────┐
│ entityExtractor   │ ← Extracts entities from natural language (with inheritance)
└────┬─────────────┘
     ▼
┌──────────┐
│ retriever │ ← Gets organizational context / metadata from DB
└────┬─────┘
     ▼
┌────────────┐
│ toolRouter  │ ← Deterministic tool selection (pattern matching + LRU cache)
└────┬───────┘
     ▼
┌──────────┐
│  agent    │ ← LLM decides tool parameters, supports parallel execution
└────┬─────┘
     ▼
┌──────────┐
│  tools    │ ← Executes selected tools, returns results
└────┬─────┘
     ▼
┌───────────┐
│ responder  │ ← Generates final response with validation
└───────────┘
     │
     ▼ (async, after response)
┌───────────┐
│ suggester  │ ← Generates follow-up suggestions
└───────────┘
```

**Key design decisions:**

- **Deterministic routing first, LLM second** — the toolRouter uses regex/pattern matching before involving the LLM, reducing latency and cost
- **Entity inheritance** — follow-up queries resolve pronouns ("that", "those") from previous turns
- **Parallel tool execution** — independent tools run concurrently
- **Progressive streaming** — tokens stream to the frontend as they're generated
- **Shared schema system** — all tools use consolidated Zod schemas via factory functions

---

## 2. Package Installation

```bash
# Initialize project
bun init -y

# Core LangChain/LangGraph packages
bun add @langchain/core @langchain/langgraph @langchain/community

# AWS Bedrock integration (Claude via Bedrock)
bun add @langchain/aws @aws-sdk/client-bedrock-runtime

# Schema validation
bun add zod

# HTTP server
bun add hono

# Database clients (adapt to your stack)
bun add couchbase neo4j-driver

# Dev dependencies
bun add -d @types/node bun-types typescript
```

**Minimum package versions (as of the reference project):**

```json
{
  "dependencies": {
    "@langchain/core": "^0.3.x",
    "@langchain/langgraph": "^0.2.x",
    "@langchain/aws": "^0.1.x",
    "@aws-sdk/client-bedrock-runtime": "^3.x",
    "zod": "^3.22.x",
    "hono": "^4.x"
  }
}
```

---

## 3. Project Structure

```
packages/backend/
├── src/
│   ├── ai/
│   │   ├── agents/
│   │   │   └── langgraph-agent.ts          # Main graph definition & orchestrator
│   │   ├── clients/
│   │   │   └── bedrock-bearer-client.ts    # AWS Bedrock client wrapper
│   │   ├── graph/
│   │   │   ├── state.ts                    # Graph state definition (AgentState)
│   │   │   ├── nodes/
│   │   │   │   ├── classify.ts             # Query classification node
│   │   │   │   ├── entity-extractor.ts     # Entity extraction node
│   │   │   │   ├── retriever.ts            # Context retrieval node
│   │   │   │   ├── tool-router.ts          # Deterministic tool routing
│   │   │   │   ├── agent.ts                # LLM agent node
│   │   │   │   ├── tools.ts                # Tool execution node
│   │   │   │   └── responder.ts            # Response generation node
│   │   │   └── edges/
│   │   │       └── routing.ts              # Conditional edge functions
│   │   ├── tools/
│   │   │   ├── cost-query-tool.ts          # Example domain tool
│   │   │   ├── trend-analysis-tool.ts
│   │   │   ├── anomaly-detection-tool.ts
│   │   │   ├── compare-periods-tool.ts
│   │   │   ├── recommendations-tool.ts
│   │   │   ├── scenario-modeling-tool.ts
│   │   │   ├── optimization-tool.ts
│   │   │   ├── root-cause-tool.ts
│   │   │   ├── spending-analysis-tool.ts
│   │   │   └── helpers/
│   │   │       ├── shared-schemas.ts       # Zod schema factory functions
│   │   │       ├── timeframe-resolver.ts   # Unified date handling
│   │   │       ├── no-data-handler.ts      # Graceful empty results
│   │   │       └── analysis-metadata.ts    # Confidence tracking
│   │   └── prompts/
│   │       ├── system-prompt.ts            # Main system prompt
│   │       └── tool-descriptions.ts        # Tool description templates
│   ├── api/
│   │   └── routes/
│   │       └── ai.ts                       # HTTP endpoints for AI chat
│   └── config/
│       └── index.ts                        # Configuration (4-pillar pattern)
├── .env                                    # Environment variables
└── package.json
```

---

## 4. Configuration & Credentials

### Environment Variables (.env)

```bash
# AWS Bedrock (AI/LLM)
AWS_BEARER_TOKEN_BEDROCK="ABSKQmVkcm9ja..."   # Bearer token for Bedrock
AWS_BEDROCK_REGION=eu-central-1
AWS_BEDROCK_MODEL_ID=eu.anthropic.claude-3-7-sonnet-20250219-v1:0
AWS_BEDROCK_MAX_TOKENS=4096
AWS_BEDROCK_TEMPERATURE=0.1

# LangSmith (Observability - Optional but recommended)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=lsv2_pt_xxxxxxxxxxxx
LANGCHAIN_PROJECT=my-project-name
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com

# Database credentials (your data layer)
COUCHBASE_CONNECTION_STRING=couchbases://...
COUCHBASE_USERNAME=app_user
COUCHBASE_PASSWORD=secure_password
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password
```

### Configuration Pattern (Zod validation)

```typescript
// src/config/schemas.ts
import { z } from 'zod';

export const BedrockConfigSchema = z.object({
  region: z.string().default('eu-central-1'),
  modelId: z.string().default('eu.anthropic.claude-3-7-sonnet-20250219-v1:0'),
  maxTokens: z.number().default(4096),
  temperature: z.number().min(0).max(1).default(0.1),
  bearerToken: z.string().optional(),
});

export const LangSmithConfigSchema = z.object({
  tracingEnabled: z.boolean().default(false),
  apiKey: z.string().optional(),
  project: z.string().default('default'),
  endpoint: z.string().default('https://api.smith.langchain.com'),
});
```

### Credential Independence

The reference architecture uses **two completely separate credential systems**:

| Purpose | Auth Method | Config Location | Used By |
|---------|-------------|-----------------|---------|
| Data sync (AWS APIs) | IAM Access Keys | `aws-credentials.json` | `sync:*` scripts |
| AI/LLM (Bedrock) | Bearer Token | `.env` | `src/ai/` layer |

This means AI failures don't affect data sync and vice versa.

---

## 5. LangGraph Workflow (Graph Definition)

### Graph State Definition

```typescript
// src/ai/graph/state.ts
import { Annotation, messagesStateReducer } from '@langchain/langgraph';

export const AgentState = Annotation.Root({
  // User input
  query: Annotation<string>,
  conversationHistory: Annotation<Message[]>,

  // Classification
  queryType: Annotation<'simple' | 'complex'>,
  confidence: Annotation<number>,

  // Extracted entities (with inheritance support)
  entities: Annotation<ExtractedEntities>,
  previousEntities: Annotation<ExtractedEntities | null>,

  // Context from databases
  organizationalContext: Annotation<any>,
  costMetadata: Annotation<any>,

  // Tool routing
  selectedTools: Annotation<string[]>,
  routingPath: Annotation<string[]>,  // Track which nodes executed

  // Agent execution
  messages: Annotation<BaseMessage[]>({ reducer: messagesStateReducer }),
  toolResults: Annotation<ToolResult[]>,

  // Response
  response: Annotation<string>,
  suggestions: Annotation<string[]>,
  metadata: Annotation<ResponseMetadata>,
});

export interface ExtractedEntities {
  accountIds?: string[];
  services?: string[];
  departments?: string[];
  domains?: string[];
  environment?: string;
  timeframe?: { start: string; end: string };
  period?: string;  // shorthand like "3m", "6m", "2025-12"
}

export interface ToolResult {
  toolName: string;
  result: any;
  executionTime: number;
}

export interface ResponseMetadata {
  routingPath: string[];
  totalTime: number;
  toolsUsed: string[];
  daysWithData?: number;
  confidence: number;
}
```

### Graph Construction

```typescript
// src/ai/agents/langgraph-agent.ts
import { StateGraph, END } from '@langchain/langgraph';
import { AgentState } from '../graph/state.js';

export function buildAgentGraph() {
  const graph = new StateGraph(AgentState)

    // Add all nodes
    .addNode('classify', classifyNode)
    .addNode('entityExtractor', entityExtractorNode)
    .addNode('retriever', retrieverNode)
    .addNode('toolRouter', toolRouterNode)
    .addNode('agent', agentNode)
    .addNode('tools', toolsNode)
    .addNode('responder', responderNode)

    // Define edges (linear flow with conditional branches)
    .addEdge('__start__', 'classify')
    .addConditionalEdges('classify', classifyRouter, {
      simple: 'responder',       // Simple queries skip tool execution
      complex: 'entityExtractor',
    })
    .addEdge('entityExtractor', 'retriever')
    .addEdge('retriever', 'toolRouter')
    .addEdge('toolRouter', 'agent')
    .addConditionalEdges('agent', agentRouter, {
      tools: 'tools',           // Agent wants to call tools
      respond: 'responder',     // Agent has enough info
    })
    .addConditionalEdges('tools', toolsRouter, {
      agent: 'agent',           // More tool calls needed
      respond: 'responder',     // Done with tools
    })
    .addEdge('responder', END);

  return graph.compile();
}

// Conditional edge functions
function classifyRouter(state: typeof AgentState.State) {
  return state.queryType === 'simple' ? 'simple' : 'complex';
}

function agentRouter(state: typeof AgentState.State) {
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage?.tool_calls?.length > 0) return 'tools';
  return 'respond';
}

function toolsRouter(state: typeof AgentState.State) {
  // Check if agent needs more tool calls
  return 'respond';  // Simplified — real implementation checks state
}
```

---

## 6. Graph Nodes (Step by Step)

### Node 1: Classify

```typescript
// src/ai/graph/nodes/classify.ts
export async function classifyNode(state: typeof AgentState.State) {
  const query = state.query.toLowerCase();

  // Simple greetings / meta questions → skip tools
  const simplePatterns = [
    /^(hi|hello|hey|thanks|thank you)/,
    /what can you do/,
    /help me/,
  ];

  const isSimple = simplePatterns.some(p => p.test(query));

  return {
    queryType: isSimple ? 'simple' : 'complex',
    confidence: isSimple ? 0.95 : 0.8,
    routingPath: [...(state.routingPath || []), 'classify'],
  };
}
```

### Node 2: Entity Extractor (with Inheritance)

```typescript
// src/ai/graph/nodes/entity-extractor.ts
export async function entityExtractorNode(state: typeof AgentState.State) {
  const query = state.query;
  const previous = state.previousEntities;

  // Extract entities from current query
  const extracted: ExtractedEntities = {};

  // Account IDs (12-digit patterns)
  const accountMatches = query.match(/\b\d{12}\b/g);
  if (accountMatches) extracted.accountIds = accountMatches;

  // Services (from known service list)
  const servicePatterns = SERVICE_NAME_MAP; // Your domain-specific list
  for (const [pattern, canonical] of Object.entries(servicePatterns)) {
    if (query.toLowerCase().includes(pattern.toLowerCase())) {
      extracted.services = [...(extracted.services || []), canonical];
    }
  }

  // Time periods
  extracted.period = extractPeriod(query);
  extracted.timeframe = resolveTimeframe(extracted.period);

  // ENTITY INHERITANCE for follow-ups
  // If current query uses pronouns or lacks entities, inherit from previous
  const usesPronouns = /\b(that|those|it|them|same|this)\b/i.test(query);
  const lacksEntities = !extracted.accountIds?.length
    && !extracted.services?.length
    && !extracted.departments?.length;

  if (previous && (usesPronouns || lacksEntities)) {
    return {
      entities: {
        ...previous,           // Inherit all previous entities
        ...extracted,          // Override with anything explicitly mentioned
      },
      routingPath: [...(state.routingPath || []), 'entityExtractor'],
    };
  }

  return {
    entities: extracted,
    routingPath: [...(state.routingPath || []), 'entityExtractor'],
  };
}
```

### Node 3: Retriever

```typescript
// src/ai/graph/nodes/retriever.ts
export async function retrieverNode(state: typeof AgentState.State) {
  // Fetch organizational context and metadata from your database
  const orgContext = await getOrganizationalHierarchy(state.entities);
  const costMetadata = await getCostMetadata(state.entities);

  return {
    organizationalContext: orgContext,
    costMetadata,
    routingPath: [...(state.routingPath || []), 'retriever'],
  };
}
```

### Node 4: Tool Router (Deterministic)

```typescript
// src/ai/graph/nodes/tool-router.ts
import { LRUCache } from 'lru-cache';

// LRU cache for repeated query patterns
const routingCache = new LRUCache<string, string[]>({ max: 500 });

const TOOL_PATTERNS: Record<string, RegExp[]> = {
  cost_query:       [/how much|total cost|spending|spend/i],
  trend_analysis:   [/trend|over time|growth|trajectory/i],
  compare_periods:  [/compare|versus|vs|month.over.month|yoy/i],
  anomaly_detection:[/anomal|spike|unusual|unexpected|surge/i],
  root_cause:       [/why|root cause|driver|explain.*increase/i],
  recommendations:  [/recommend|suggest|optimize|savings/i],
  optimization:     [/rightsize|unused|waste|idle|underutilized/i],
  scenario_modeling:[/what if|scenario|add.*instance|forecast.*if/i],
  spending_analysis:[/breakdown|distribution|by category|by service/i],
};

export async function toolRouterNode(state: typeof AgentState.State) {
  const query = state.query;

  // Check cache first
  const cacheKey = normalizeForCache(query);
  const cached = routingCache.get(cacheKey);
  if (cached) {
    return {
      selectedTools: cached,
      routingPath: [...(state.routingPath || []), 'toolRouter(cached)'],
    };
  }

  // Pattern matching
  const matched: string[] = [];
  for (const [toolName, patterns] of Object.entries(TOOL_PATTERNS)) {
    if (patterns.some(p => p.test(query))) {
      matched.push(toolName);
    }
  }

  // Default to cost_query if nothing matched
  const selected = matched.length > 0 ? matched : ['cost_query'];

  // Cache the result
  routingCache.set(cacheKey, selected);

  return {
    selectedTools: selected,
    routingPath: [...(state.routingPath || []), 'toolRouter'],
  };
}
```

### Node 5: Agent (LLM with Tools)

```typescript
// src/ai/graph/nodes/agent.ts
import { ChatBedrockConverse } from '@langchain/aws';

export async function agentNode(state: typeof AgentState.State) {
  const model = new ChatBedrockConverse({
    model: process.env.AWS_BEDROCK_MODEL_ID,
    region: process.env.AWS_BEDROCK_REGION,
    credentials: getBedrockCredentials(),
    temperature: 0.1,
    maxTokens: 4096,
  });

  // Bind only the selected tools (from toolRouter)
  const selectedToolInstances = state.selectedTools.map(name => toolRegistry[name]);
  const modelWithTools = model.bindTools(selectedToolInstances);

  const systemMessage = buildSystemPrompt(state);

  const response = await modelWithTools.invoke([
    { role: 'system', content: systemMessage },
    ...state.messages,
    { role: 'user', content: state.query },
  ]);

  return {
    messages: [response],
    routingPath: [...(state.routingPath || []), 'agent'],
  };
}
```

### Node 6: Tools (Parallel Execution)

```typescript
// src/ai/graph/nodes/tools.ts
import { ToolNode } from '@langchain/langgraph/prebuilt';

export async function toolsNode(state: typeof AgentState.State) {
  const lastMessage = state.messages[state.messages.length - 1];
  const toolCalls = lastMessage.tool_calls || [];

  // Execute tools in parallel when independent
  const results = await Promise.all(
    toolCalls.map(async (call) => {
      const tool = toolRegistry[call.name];
      const startTime = Date.now();
      const result = await tool.invoke(call.args);
      return {
        toolName: call.name,
        result,
        executionTime: Date.now() - startTime,
      };
    })
  );

  // Convert to tool messages for the agent
  const toolMessages = results.map((r, i) => ({
    role: 'tool' as const,
    content: JSON.stringify(r.result),
    tool_call_id: toolCalls[i].id,
  }));

  return {
    messages: toolMessages,
    toolResults: results,
    routingPath: [...(state.routingPath || []), 'tools'],
  };
}
```

### Node 7: Responder

```typescript
// src/ai/graph/nodes/responder.ts
export async function responderNode(state: typeof AgentState.State) {
  const model = new ChatBedrockConverse({
    model: process.env.AWS_BEDROCK_MODEL_ID,
    region: process.env.AWS_BEDROCK_REGION,
    credentials: getBedrockCredentials(),
  });

  // Build response with all context
  const response = await model.invoke([
    {
      role: 'system',
      content: `Generate a clear, data-driven response. Include specific numbers.
                Data confidence: ${state.metadata?.confidence || 'unknown'}.
                Days with data: ${state.metadata?.daysWithData || 'unknown'}.`,
    },
    ...state.messages,
  ]);

  return {
    response: response.content,
    metadata: {
      routingPath: state.routingPath || [],
      totalTime: Date.now() - (state.metadata?.startTime || Date.now()),
      toolsUsed: state.selectedTools || [],
      confidence: state.confidence || 0.5,
    },
    routingPath: [...(state.routingPath || []), 'responder'],
  };
}
```

---

## 7. Tool System

### Tool Definition Pattern

Each tool follows this pattern using Zod schemas and the `@langchain/core/tools` base:

```typescript
// src/ai/tools/trend-analysis-tool.ts
import { DynamicStructuredTool } from '@langchain/core/tools';
import { createToolInputSchema } from './helpers/shared-schemas.js';
import { resolveTimeframe } from './helpers/timeframe-resolver.js';

export const trendAnalysisTool = new DynamicStructuredTool({
  name: 'trend_analysis',
  description: 'Analyze cost trends over time. Use for questions about cost direction, growth rate, and trajectory.',
  schema: createToolInputSchema({
    period: true,
    threshold: true,
    limit: true,
  }),

  func: async (input) => {
    const { startDate, endDate } = resolveTimeframe(input.period, input.timeframe);

    // Query your database
    const costData = await repository.getCostsByDateRange(
      startDate,
      endDate,
      input.accountId,
      input.service,
    );

    if (!costData.length) {
      return handleNoData('trend_analysis', input);
    }

    // Calculate trends
    const trend = calculateTrend(costData);

    return {
      direction: trend.direction,       // 'increasing' | 'decreasing' | 'stable'
      velocity: trend.velocity,         // percentage change per month
      totalCost: trend.totalCost,
      monthlyBreakdown: trend.monthly,
      forecast: trend.forecast,
      confidence: trend.confidence,
      metadata: {
        dataPoints: costData.length,
        dateRange: { start: startDate, end: endDate },
      },
    };
  },
});
```

### Tool Registry

```typescript
// src/ai/tools/index.ts
import { costQueryTool } from './cost-query-tool.js';
import { trendAnalysisTool } from './trend-analysis-tool.js';
import { comparePeriodsToool } from './compare-periods-tool.js';
// ... import all tools

export const toolRegistry: Record<string, DynamicStructuredTool> = {
  cost_query: costQueryTool,
  trend_analysis: trendAnalysisTool,
  compare_periods: comparePeriodsTool,
  anomaly_detection: anomalyDetectionTool,
  root_cause: rootCauseTool,
  recommendations: recommendationsTool,
  optimization: optimizationTool,
  scenario_modeling: scenarioModelingTool,
  spending_analysis: spendingAnalysisTool,
};

export const allTools = Object.values(toolRegistry);
```

---

## 8. Shared Schemas & Helpers

### Schema Factory Functions

```typescript
// src/ai/tools/helpers/shared-schemas.ts
import { z } from 'zod';

// Base scope fields (shared by all tools)
const baseScopeSchema = {
  accountId: z.string().optional().describe('AWS account ID'),
  accountIds: z.array(z.string()).optional().describe('Multiple account IDs'),
  service: z.string().optional().describe('AWS service name'),
  category: z.string().optional().describe('Service category'),
  environment: z.string().optional().describe('Environment (prd, stg, dev)'),
  region: z.string().optional().describe('AWS region'),
};

// Extended scope (adds org hierarchy fields)
const extendedScopeSchema = {
  ...baseScopeSchema,
  department: z.string().optional().describe('Department name'),
  domain: z.string().optional().describe('Domain name'),
  organization: z.string().optional().describe('Organization name'),
};

interface SchemaOptions {
  period?: boolean;
  threshold?: boolean;
  limit?: boolean;
  comparisonType?: boolean;
}

export function createToolInputSchema(options: SchemaOptions = {}) {
  const fields: Record<string, z.ZodType> = { ...baseScopeSchema };

  if (options.period) {
    fields.period = z.string().optional().describe('Time period (3m, 6m, 12m, YYYY-MM)');
    fields.timeframe = z.object({
      start_year: z.number(), start_month: z.number(),
      end_year: z.number(), end_month: z.number(),
    }).optional().describe('Explicit date range');
  }
  if (options.threshold) {
    fields.threshold = z.number().optional().describe('Threshold value');
  }
  if (options.limit) {
    fields.limit = z.number().optional().describe('Max results to return');
  }
  if (options.comparisonType) {
    fields.comparisonType = z.enum(['month_over_month', 'year_over_year', 'custom'])
      .optional().describe('Comparison type');
  }

  return z.object(fields);
}

export function createExtendedToolInputSchema(options: SchemaOptions = {}) {
  // Same as above but with department/domain/org fields
  const fields: Record<string, z.ZodType> = { ...extendedScopeSchema };
  // ... add optional fields same as above
  return z.object(fields);
}
```

### Unified Timeframe Resolver

```typescript
// src/ai/tools/helpers/timeframe-resolver.ts
export function resolveTimeframe(
  period?: string,
  timeframe?: { start_year: number; start_month: number; end_year: number; end_month: number }
): { startDate: string; endDate: string } {
  const now = new Date();

  // Explicit timeframe takes priority
  if (timeframe) {
    return {
      startDate: `${timeframe.start_year}-${String(timeframe.start_month).padStart(2, '0')}-01`,
      endDate: `${timeframe.end_year}-${String(timeframe.end_month).padStart(2, '0')}-01`,
    };
  }

  // Relative periods
  if (period) {
    const monthMatch = period.match(/^(\d+)m$/);
    if (monthMatch) {
      const months = parseInt(monthMatch[1]);
      const start = new Date(now);
      start.setMonth(start.getMonth() - months);
      return { startDate: formatDate(start), endDate: formatDate(now) };
    }

    // Specific month (YYYY-MM)
    if (/^\d{4}-\d{2}$/.test(period)) {
      const [year, month] = period.split('-');
      const nextMonth = new Date(parseInt(year), parseInt(month), 1);
      return {
        startDate: `${period}-01`,
        endDate: formatDate(nextMonth),
      };
    }
  }

  // Default: last 3 months
  const start = new Date(now);
  start.setMonth(start.getMonth() - 3);
  return { startDate: formatDate(start), endDate: formatDate(now) };
}
```

### Graceful No-Data Handler

```typescript
// src/ai/tools/helpers/no-data-handler.ts
export function handleNoData(toolName: string, input: any): string {
  const context = [];
  if (input.accountId) context.push(`account ${input.accountId}`);
  if (input.service) context.push(`service "${input.service}"`);
  if (input.period) context.push(`period ${input.period}`);

  return JSON.stringify({
    status: 'no_data',
    message: `No data found for ${toolName}${context.length ? ` (${context.join(', ')})` : ''}`,
    suggestions: [
      'Try a broader time range',
      'Check if the account/service name is correct',
      'Verify data has been synced for this period',
    ],
  });
}
```

---

## 9. Bedrock Client Setup

### Bearer Token Authentication

```typescript
// src/ai/clients/bedrock-bearer-client.ts
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

export function createBedrockClient() {
  const bearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
  const region = process.env.AWS_BEDROCK_REGION || 'eu-central-1';

  const client = new BedrockRuntimeClient({
    region,
    credentials: bearerToken
      ? { token: bearerToken }  // Bearer token auth
      : undefined,              // Falls back to default credential chain
  });

  return client;
}
```

### Using with LangChain

```typescript
// Using ChatBedrockConverse (recommended)
import { ChatBedrockConverse } from '@langchain/aws';

const model = new ChatBedrockConverse({
  model: process.env.AWS_BEDROCK_MODEL_ID,  // e.g. "eu.anthropic.claude-3-7-sonnet-20250219-v1:0"
  region: process.env.AWS_BEDROCK_REGION,
  credentials: getBedrockCredentials(),
  temperature: 0.1,
  maxTokens: 4096,
});

// Model switching via environment variable — no code changes needed
// Set AWS_BEDROCK_MODEL_ID to switch models instantly
```

---

## 10. API Layer (HTTP + Streaming)

### HTTP Endpoints

```typescript
// src/api/routes/ai.ts
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { buildAgentGraph } from '../../ai/agents/langgraph-agent.js';

const ai = new Hono();
const graph = buildAgentGraph();

// Standard query endpoint
ai.post('/api/ai/query', async (c) => {
  const { query, conversationHistory } = await c.req.json();

  const result = await graph.invoke({
    query,
    conversationHistory: conversationHistory || [],
    routingPath: [],
  });

  return c.json({
    response: result.response,
    metadata: result.metadata,
    suggestions: result.suggestions,
  });
});

// Streaming endpoint (progressive token delivery)
ai.post('/api/ai/stream', async (c) => {
  const { query, conversationHistory } = await c.req.json();

  return streamSSE(c, async (stream) => {
    const eventStream = graph.streamEvents(
      {
        query,
        conversationHistory: conversationHistory || [],
        routingPath: [],
      },
      { version: 'v2' }
    );

    for await (const event of eventStream) {
      if (event.event === 'on_chat_model_stream') {
        const chunk = event.data?.chunk?.content;
        if (chunk) {
          await stream.writeSSE({
            event: 'token',
            data: JSON.stringify({ content: chunk }),
          });
        }
      }

      if (event.event === 'on_tool_start') {
        await stream.writeSSE({
          event: 'tool_start',
          data: JSON.stringify({ tool: event.name }),
        });
      }

      if (event.event === 'on_tool_end') {
        await stream.writeSSE({
          event: 'tool_end',
          data: JSON.stringify({ tool: event.name }),
        });
      }
    }

    await stream.writeSSE({ event: 'done', data: '{}' });
  });
});

export default ai;
```

### Bun Server

```typescript
// src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import ai from './api/routes/ai.js';

const app = new Hono();
app.use('*', cors());
app.route('/', ai);

app.get('/health', (c) => c.json({ status: 'healthy' }));

export default {
  port: process.env.PORT || 3000,
  fetch: app.fetch,
};
```

---

## 11. LangSmith Observability

### Setup

LangSmith tracing is activated via environment variables — **no code changes required** when using LangChain/LangGraph:

```bash
# .env
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=lsv2_pt_xxxxxxxxxxxx
LANGCHAIN_PROJECT=aws-cost-analyzer    # Project name in LangSmith dashboard
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
```

When these are set, every LangGraph invocation automatically:
- Traces all node executions with timing
- Captures tool inputs/outputs
- Records LLM prompts and completions
- Tracks token usage and costs
- Shows the full execution graph

### Custom Run Metadata

```typescript
// Add custom metadata to traces
const result = await graph.invoke(
  { query, routingPath: [] },
  {
    metadata: {
      userId: 'user-123',
      sessionId: 'session-abc',
      source: 'web-chat',
    },
    tags: ['production', 'cost-query'],
    runName: `query: ${query.slice(0, 50)}`,
  }
);
```

### Disabling in Development

```bash
# Set to false or remove to disable tracing
LANGCHAIN_TRACING_V2=false
```

### What LangSmith Shows You

- **Trace timeline** — see exactly which nodes ran, in what order, and how long each took
- **Tool execution** — input parameters and returned data for each tool
- **LLM calls** — full prompt, completion, token count, and latency
- **Error tracking** — failed nodes with stack traces
- **Cost tracking** — token usage per model per trace
- **Feedback** — thumbs up/down on responses for evaluation

---

## 12. Entity Inheritance (Multi-turn Context)

This is a key pattern for natural conversation flow:

```
Turn 1: "Show EC2 costs for OIT in December"
  → entities: { services: ["EC2"], departments: ["OIT"], period: "2025-12" }

Turn 2: "Compare that to staging"
  → "that" triggers inheritance
  → entities: { services: ["EC2"], departments: ["OIT"], period: "2025-12", environment: "Staging" }

Turn 3: "What about last quarter?"
  → inherits services + departments, overrides timeframe
  → entities: { services: ["EC2"], departments: ["OIT"], period: "3m" }
```

**Inheritance rules:**

| Pattern | Behavior |
|---------|----------|
| Pronouns ("that", "those", "it") | Inherit all previous entities |
| "Compare to X" | Keep previous + add X |
| "Same timeframe" | Inherit exact timeframe |
| No explicit entities | Inherit all previous |
| Explicit mention | Override inherited value |

Implementation is in the entity extractor node (see Node 2 above).

---

## 13. Checklist for New Projects

Use this checklist when replicating this architecture for a new application:

### Phase 1: Foundation

- [ ] Initialize Bun project with TypeScript
- [ ] Install LangChain/LangGraph + Bedrock packages
- [ ] Set up configuration with Zod validation
- [ ] Configure Bedrock credentials (bearer token or IAM)
- [ ] Verify Bedrock connectivity with a test invocation

### Phase 2: Graph Structure

- [ ] Define `AgentState` annotation with all required fields
- [ ] Create node files: classify, entityExtractor, retriever, toolRouter, agent, tools, responder
- [ ] Build the graph with `StateGraph` and wire edges
- [ ] Add conditional routing edges
- [ ] Test graph execution with a simple query

### Phase 3: Tools

- [ ] Create shared schema factories (`createToolInputSchema`)
- [ ] Create unified timeframe resolver
- [ ] Create no-data handler
- [ ] Implement domain-specific tools (minimum: 1 query tool)
- [ ] Create tool registry
- [ ] Wire tools into agent node with `bindTools`

### Phase 4: Domain Adaptation

- [ ] Define entity extraction patterns for your domain
- [ ] Create tool routing patterns (regex) for your query types
- [ ] Connect retriever node to your database(s)
- [ ] Write system prompt with domain context
- [ ] Add entity inheritance for multi-turn conversations

### Phase 5: API & Streaming

- [ ] Create HTTP query endpoint
- [ ] Create SSE streaming endpoint
- [ ] Add health check endpoint
- [ ] Test streaming with frontend

### Phase 6: Observability

- [ ] Enable LangSmith tracing (set env vars)
- [ ] Add custom metadata to traces
- [ ] Verify traces appear in LangSmith dashboard
- [ ] Set up LangSmith project for production vs development

### Phase 7: Production Hardening

- [ ] Add error handling in every node
- [ ] Add timeout handling for tool execution
- [ ] Implement graceful degradation (tool failures don't crash graph)
- [ ] Add response validation in responder node
- [ ] Test parallel tool execution
- [ ] Load test the streaming endpoint

---

## Quick Reference: Key Files to Copy

When starting a new project, copy and adapt these files first:

| File | Purpose | Adaptation Needed |
|------|---------|-------------------|
| `graph/state.ts` | State definition | Add your domain-specific fields |
| `tools/helpers/shared-schemas.ts` | Schema factories | Adjust field options |
| `tools/helpers/timeframe-resolver.ts` | Date handling | Usually no changes |
| `tools/helpers/no-data-handler.ts` | Empty results | Customize messages |
| `graph/nodes/classify.ts` | Query classification | Update patterns |
| `graph/nodes/tool-router.ts` | Tool routing | Define your tool patterns |
| `graph/nodes/agent.ts` | LLM agent | Update system prompt |
| `agents/langgraph-agent.ts` | Graph wiring | Adjust edges as needed |

---

## Environment Variable Quick Reference

```bash
# Required
AWS_BEDROCK_REGION=eu-central-1
AWS_BEDROCK_MODEL_ID=eu.anthropic.claude-3-7-sonnet-20250219-v1:0
AWS_BEARER_TOKEN_BEDROCK=ABSKQmVkcm9ja...

# LangSmith (optional but recommended)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=lsv2_pt_xxxxxxxxxxxx
LANGCHAIN_PROJECT=your-project-name

# Optional tuning
AWS_BEDROCK_MAX_TOKENS=4096
AWS_BEDROCK_TEMPERATURE=0.1
```
