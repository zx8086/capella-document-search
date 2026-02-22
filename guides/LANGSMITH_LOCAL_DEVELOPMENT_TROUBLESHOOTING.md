# LangSmith Local Development Troubleshooting Guide

## Issue: Traces Not Appearing in Local Development

When traces appear for test endpoints but not for main application flows, it's typically an environment variable loading issue.

## Quick Diagnosis Checklist

### 1. Verify Environment Variables are Loaded

Add this debug code to your main API route to verify environment variables:

```typescript
// src/routes/api/chat/+server.ts
// Add at the top of your POST handler

console.log("🔍 [ENV CHECK] LangSmith Configuration:", {
  LANGCHAIN_TRACING_V2: Bun.env.LANGCHAIN_TRACING_V2,
  LANGCHAIN_API_KEY: Bun.env.LANGCHAIN_API_KEY ? "✅ Set" : "❌ Missing",
  LANGCHAIN_PROJECT: Bun.env.LANGCHAIN_PROJECT,
  LANGCHAIN_ENDPOINT: Bun.env.LANGCHAIN_ENDPOINT,
  LANGSMITH_TRACING: Bun.env.LANGSMITH_TRACING,
  LANGSMITH_API_KEY: Bun.env.LANGSMITH_API_KEY ? "✅ Set" : "❌ Missing",
  LANGSMITH_PROJECT: Bun.env.LANGSMITH_PROJECT,
});
```

### 2. Check .env File Location

Ensure your `.env` file is in the project root:
```
/Users/SOwusu/WebstormProjects/capella-document-search/
├── .env                  # ← Should be here
├── .env.development      # ← Or here for dev
├── package.json
└── src/
```

### 3. Verify .env File Format

Your `.env` file should look like:
```bash
# Use either set (LANGCHAIN or LANGSMITH)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=lsv2_pt_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
LANGCHAIN_PROJECT=capella-document-search
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
```

### 4. Force Environment Variable Loading

If using Bun, add this to your main entry point:

```typescript
// src/app.d.ts or src/hooks.server.ts
import dotenv from 'dotenv';
dotenv.config();

// Or for Bun specifically
if (typeof Bun !== 'undefined') {
  // Bun automatically loads .env, but we can force it
  console.log("Running with Bun, env should be loaded");
}
```

## Solution 1: Explicit Environment Variable Setting

Add a initialization check at the top of your API route:

```typescript
// src/routes/api/chat/+server.ts

// Force set environment variables if missing (development only)
if (dev && !Bun.env.LANGCHAIN_TRACING_V2) {
  console.warn("⚠️ LangSmith environment variables not found, setting defaults for development");
  
  // Only do this in development!
  process.env.LANGCHAIN_TRACING_V2 = 'true';
  process.env.LANGCHAIN_ENDPOINT = 'https://api.smith.langchain.com';
  // Don't set API key here - it should come from .env
}
```

## Solution 2: Environment Variable Validation

Create a validation function:

```typescript
// src/lib/config/langsmith.ts

export function validateLangSmithConfig() {
  const required = [
    'LANGCHAIN_API_KEY',
    'LANGCHAIN_PROJECT',
  ];
  
  const missing = required.filter(key => !Bun.env[key] && !process.env[key]);
  
  if (missing.length > 0) {
    console.error("❌ Missing required LangSmith environment variables:", missing);
    console.log("Current environment variables:", {
      LANGCHAIN_TRACING_V2: Bun.env.LANGCHAIN_TRACING_V2 || process.env.LANGCHAIN_TRACING_V2,
      LANGCHAIN_PROJECT: Bun.env.LANGCHAIN_PROJECT || process.env.LANGCHAIN_PROJECT,
      hasApiKey: !!(Bun.env.LANGCHAIN_API_KEY || process.env.LANGCHAIN_API_KEY),
    });
    return false;
  }
  
  console.log("✅ LangSmith configuration validated successfully");
  return true;
}

// Call this at the start of your API route
if (!validateLangSmithConfig()) {
  console.warn("LangSmith tracing will not work without proper configuration");
}
```

## Solution 3: Use .env.development for Local Development

Create a `.env.development` file specifically for local development:

```bash
# .env.development
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your_actual_api_key_here
LANGCHAIN_PROJECT=capella-document-search
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
```

Then ensure SvelteKit loads it:

```typescript
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Load env file based on mode
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [sveltekit()],
    define: {
      // Make env vars available
      'process.env.LANGCHAIN_TRACING_V2': JSON.stringify(env.LANGCHAIN_TRACING_V2),
      'process.env.LANGCHAIN_API_KEY': JSON.stringify(env.LANGCHAIN_API_KEY),
      'process.env.LANGCHAIN_PROJECT': JSON.stringify(env.LANGCHAIN_PROJECT),
      'process.env.LANGCHAIN_ENDPOINT': JSON.stringify(env.LANGCHAIN_ENDPOINT),
    },
  };
});
```

## Solution 4: Debug Trace Context

Add detailed debugging to see where tracing breaks:

```typescript
// In your processConversation function
const processConversation = traceable(
  async (...args) => {
    // Debug: Check if tracing is active
    const { getCurrentRunTree } = await import("langsmith/traceable");
    const currentRun = getCurrentRunTree();
    
    console.log("🔍 [TRACE DEBUG] In processConversation:", {
      hasCurrentRun: !!currentRun,
      runId: currentRun?.id,
      tracingEnabled: Bun.env.LANGCHAIN_TRACING_V2,
      project: Bun.env.LANGCHAIN_PROJECT,
      hasApiKey: !!Bun.env.LANGCHAIN_API_KEY,
    });
    
    if (!currentRun) {
      console.warn("⚠️ No active run tree - tracing may not be working");
    }
    
    // Your existing logic...
  },
  {
    run_type: "chain",
    name: "Chat Conversation",
  }
);
```

## Solution 5: Test with Direct Initialization

Create a test to verify LangSmith is working:

```typescript
// src/routes/api/test-langsmith-init/+server.ts

import { json } from '@sveltejs/kit';
import { traceable } from 'langsmith/traceable';

// Explicitly check and log configuration
console.log("LangSmith Test Endpoint Configuration:", {
  TRACING: Bun.env.LANGCHAIN_TRACING_V2,
  PROJECT: Bun.env.LANGCHAIN_PROJECT,
  HAS_KEY: !!Bun.env.LANGCHAIN_API_KEY,
  ENDPOINT: Bun.env.LANGCHAIN_ENDPOINT,
});

const testTracing = traceable(
  async (message: string) => {
    return { processed: message, timestamp: new Date().toISOString() };
  },
  { name: "Test Tracing Init" }
);

export async function GET() {
  const result = await testTracing("Testing LangSmith initialization");
  return json({ success: true, result });
}
```

## Common Issues and Fixes

### Issue 1: Environment Variables Not Loading
**Symptom**: `Bun.env.LANGCHAIN_API_KEY` is undefined
**Fix**: Ensure `.env` file is in project root and restart the dev server

### Issue 2: Wrong Environment Variable Names
**Symptom**: Traces work in test but not main app
**Fix**: Use consistent naming (either LANGCHAIN_* or LANGSMITH_*, not both)

### Issue 3: API Key Issues
**Symptom**: 401 or 403 errors in console
**Fix**: Verify API key is correct and has proper permissions

### Issue 4: Project Name Mismatch
**Symptom**: Traces appear in wrong project or default project
**Fix**: Ensure `LANGCHAIN_PROJECT` matches your LangSmith project name exactly

## Verification Steps

1. **Check environment variables are loaded**:
   ```bash
   bun run dev
   # In another terminal:
   curl http://localhost:5173/api/test-langsmith-init
   ```

2. **Check browser console** for any errors when making chat requests

3. **Check server logs** for the debug output we added

4. **Verify in LangSmith dashboard**:
   - Go to your project
   - Check "Recent Runs" 
   - Look for "Chat Conversation" traces

## Quick Fix Script

Run this in your project root to diagnose issues:

```bash
#!/bin/bash
echo "Checking LangSmith configuration..."

# Check if .env exists
if [ -f .env ]; then
    echo "✅ .env file found"
    
    # Check for required variables
    if grep -q "LANGCHAIN_API_KEY\|LANGSMITH_API_KEY" .env; then
        echo "✅ API key configured"
    else
        echo "❌ API key not found in .env"
    fi
    
    if grep -q "LANGCHAIN_PROJECT\|LANGSMITH_PROJECT" .env; then
        echo "✅ Project configured"
    else
        echo "❌ Project not configured in .env"
    fi
    
    if grep -q "LANGCHAIN_TRACING_V2\|LANGSMITH_TRACING" .env; then
        echo "✅ Tracing enabled"
    else
        echo "❌ Tracing not enabled in .env"
    fi
else
    echo "❌ .env file not found"
fi

# Test the configuration
echo "Testing configuration..."
bun run src/routes/api/test-tracing/+server.ts
```

## Final Checklist

- [ ] `.env` file exists in project root
- [ ] `LANGCHAIN_API_KEY` is set and valid
- [ ] `LANGCHAIN_PROJECT` matches LangSmith project name
- [ ] `LANGCHAIN_TRACING_V2=true` is set
- [ ] Dev server was restarted after env changes
- [ ] Test endpoint shows traces in LangSmith
- [ ] Main chat endpoint shows traces in LangSmith

If all checks pass but traces still don't appear, the issue may be with the specific execution context in Claude Desktop. Try running the app directly with `bun run dev` instead.