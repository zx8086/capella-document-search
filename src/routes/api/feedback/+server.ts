/* src/routes/api/feedback/+server.ts */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { Client } from "langsmith";
import { log, err } from "$utils/unifiedLogger";

// Initialize Langsmith client
const langsmithClient = new Client({
  apiKey: Bun.env.LANGCHAIN_API_KEY,
  apiUrl: Bun.env.LANGCHAIN_ENDPOINT || "https://api.smith.langchain.com",
});

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { runId, score, comment, userId, userName } = await request.json();

    // Validate required fields
    if (!runId) {
      return json({ error: "Run ID is required" }, { status: 400 });
    }

    if (score === undefined || score === null) {
      return json({ error: "Score is required" }, { status: 400 });
    }

    // Validate score range (-1, 0, 1)
    if (score !== -1 && score !== 0 && score !== 1) {
      return json({ error: "Score must be -1 (thumbs down), 0 (neutral), or 1 (thumbs up)" }, { status: 400 });
    }

    log("📝 [Feedback] Submitting feedback to Langsmith", {
      runId,
      score,
      hasComment: !!comment,
      userId: userId || "anonymous",
      userName: userName || "anonymous",
    });

    // Create feedback with Langsmith client
    await langsmithClient.createFeedback(runId, "user_rating", {
      score: score,
      comment: comment,
      sourceInfo: {
        userId: userId || "anonymous",
        userName: userName || "anonymous",
        timestamp: new Date().toISOString(),
        source: "chat_interface",
      },
    });

    log("✅ [Feedback] Successfully submitted feedback", {
      runId,
      score,
      userId: userId || "anonymous",
    });

    return json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    err("❌ [Feedback] Error submitting feedback:", {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Check for specific error types
    if (errorMessage.includes("not found")) {
      return json({ error: "Run not found. The feedback session may have expired." }, { status: 404 });
    }

    if (errorMessage.includes("unauthorized") || errorMessage.includes("forbidden")) {
      return json({ error: "Authentication failed. Please try again later." }, { status: 401 });
    }

    return json({ error: "Failed to submit feedback. Please try again later." }, { status: 500 });
  }
};