/* src/routes/api/health-check/+page.server.ts */

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ fetch, url, depends }) => {
  depends("app:health-check");

  try {
    const checkType = url.searchParams.get("type") || "Simple";
    const response = await fetch(`/api/health-check?type=${checkType}`);

    if (!response.ok) {
      throw new Error(`Health check failed with status: ${response.status}`);
    }

    let healthStatus;
    try {
      healthStatus = await response.json();
    } catch (_e) {
      throw new Error("Invalid JSON response from health check endpoint");
    }

    return {
      healthStatus,
      checkType: checkType as "Simple" | "Detailed",
      showBuildInfo: false,
    };
  } catch (error) {
    return {
      healthStatus: {
        status: "ERROR",
        message: error instanceof Error ? error.message : "Unknown error occurred",
        checks: {},
        checkType: url.searchParams.get("type") || "Simple",
      },
      checkType: "Simple" as const,
      showBuildInfo: false,
    };
  }
};
