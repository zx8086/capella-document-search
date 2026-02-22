// Diagnostic endpoint to check LangSmith configuration
import { json } from "@sveltejs/kit";
import { getCurrentRunTree } from "langsmith/singletons/traceable";
import { traceable } from "langsmith/traceable";

// Test traceable function
const diagnosticTrace = traceable(
  async (testData: any) => {
    const currentRun = getCurrentRunTree();

    return {
      traceActive: !!currentRun,
      traceId: currentRun?.id || null,
      traceName: currentRun?.name || null,
      testData,
      timestamp: new Date().toISOString(),
    };
  },
  {
    name: "LangSmith Diagnostic",
    run_type: "chain",
    tags: ["diagnostic", "test"],
  }
);

export async function GET() {
  // Check environment variables
  const envCheck = {
    // Check both naming conventions
    LANGCHAIN: {
      TRACING_V2: Bun.env.LANGCHAIN_TRACING_V2 || process.env.LANGCHAIN_TRACING_V2,
      API_KEY:
        Bun.env.LANGCHAIN_API_KEY || process.env.LANGCHAIN_API_KEY ? "[OK] Set" : "[ERROR] Missing",
      PROJECT: Bun.env.LANGCHAIN_PROJECT || process.env.LANGCHAIN_PROJECT || "Not set",
      ENDPOINT: Bun.env.LANGCHAIN_ENDPOINT || process.env.LANGCHAIN_ENDPOINT || "Not set",
    },
    LANGSMITH: {
      TRACING: Bun.env.LANGSMITH_TRACING || process.env.LANGSMITH_TRACING,
      API_KEY:
        Bun.env.LANGSMITH_API_KEY || process.env.LANGSMITH_API_KEY ? "[OK] Set" : "[ERROR] Missing",
      PROJECT: Bun.env.LANGSMITH_PROJECT || process.env.LANGSMITH_PROJECT || "Not set",
      ENDPOINT: Bun.env.LANGSMITH_ENDPOINT || process.env.LANGSMITH_ENDPOINT || "Not set",
    },
    runtime: {
      isBun: typeof Bun !== "undefined",
      nodeVersion: process.version,
      cwd: process.cwd(),
    },
  };

  // Try to execute a traced function
  let traceResult = null;
  let traceError = null;

  try {
    traceResult = await diagnosticTrace({
      message: "Testing LangSmith tracing",
      environment: envCheck.runtime,
    });
  } catch (error) {
    traceError = {
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 3),
    };
  }

  // Determine which configuration is active
  const activeConfig = {
    usingLangchain: !!(
      envCheck.LANGCHAIN.TRACING_V2 && envCheck.LANGCHAIN.API_KEY !== "[ERROR] Missing"
    ),
    usingLangsmith: !!(
      envCheck.LANGSMITH.TRACING && envCheck.LANGSMITH.API_KEY !== "[ERROR] Missing"
    ),
    tracingEnabled: false,
  };

  activeConfig.tracingEnabled = activeConfig.usingLangchain || activeConfig.usingLangsmith;

  // Recommendations
  const recommendations = [];

  if (!activeConfig.tracingEnabled) {
    recommendations.push("[ERROR] Tracing is NOT enabled. Set environment variables in .env file");
  } else {
    recommendations.push("[OK] Tracing is enabled");
  }

  if (
    envCheck.LANGCHAIN.API_KEY === "[ERROR] Missing" &&
    envCheck.LANGSMITH.API_KEY === "[ERROR] Missing"
  ) {
    recommendations.push("[ERROR] No API key found. Add LANGCHAIN_API_KEY to .env");
  }

  if (!envCheck.LANGCHAIN.PROJECT && !envCheck.LANGSMITH.PROJECT) {
    recommendations.push("[WARNING] No project name set. Add LANGCHAIN_PROJECT to .env");
  }

  if (activeConfig.usingLangchain && activeConfig.usingLangsmith) {
    recommendations.push("[WARNING] Both LANGCHAIN and LANGSMITH variables set. Use only one set");
  }

  // Log to console for debugging
  console.log("[DEBUG] LangSmith Diagnostic Results:", {
    envCheck,
    activeConfig,
    traceResult,
    traceError,
    recommendations,
  });

  return json(
    {
      status: activeConfig.tracingEnabled ? "configured" : "not_configured",
      environment: envCheck,
      activeConfig,
      traceTest: {
        result: traceResult,
        error: traceError,
      },
      recommendations,
      instructions: {
        step1: "Check the 'environment' section to see which variables are set",
        step2: "Ensure either LANGCHAIN_* or LANGSMITH_* variables are configured (not both)",
        step3: "Verify API key is set and project name matches your LangSmith dashboard",
        step4: "If configured but not working, restart your dev server after setting .env",
      },
    },
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}
