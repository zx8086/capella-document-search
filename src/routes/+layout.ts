// src/routes/+layout.ts

import { redirect } from "@sveltejs/kit";
import { browser } from "$app/environment";
import { auth, authStore } from "$lib/stores/auth.svelte";
import { featureFlags } from "$lib/stores/featureFlags.svelte";
import { initDebugTools } from "$lib/utils/debugUtils";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async ({ url }) => {
  const publicPaths = ["/login"];
  const isPublicPath = publicPaths.some((path) => url.pathname.startsWith(path));

  try {
    // Initialize feature flags only in browser
    if (browser) {
      try {
        await featureFlags.initialize();
      } catch (error) {
        console.warn("Feature flags initialization failed:", error);
        // Don't block the app if feature flags fail
      }
    }

    // Initialize auth state
    await auth.initialize();
    const isUserAuthenticated = auth.checkAuth();

    // If we're on login page and already authenticated, redirect to home
    if (isPublicPath && isUserAuthenticated) {
      throw redirect(307, "/");
    }

    // If we're not on a public path and not authenticated, redirect to login
    if (!isPublicPath && !isUserAuthenticated) {
      throw redirect(307, "/login");
    }

    return {
      featureFlags: !!browser, // Indicate if feature flags are available
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("redirect")) {
      throw error;
    }
    console.error("Layout load error:", error);
    authStore.setLoading(false);
    throw redirect(307, "/login");
  }
};
// Only initialize debug tools in browser and development
if (browser && import.meta.env.DEV) {
  initDebugTools();
}

export const ssr = false; // Disable SSR for this layout if needed
