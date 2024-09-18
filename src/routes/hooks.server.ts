/* src/routes/hooks.server.ts */

import type { Handle } from "@sveltejs/kit";

export const handle: Handle = async ({ event, resolve }) => {
  // Resolve the response first
  const response = await resolve(event);

  // Log the response before processing
  console.log("Response before processing:", {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
  });

  // Attempt to clone and read the body for logging
  // Note: This may not always be possible depending on the body type
  try {
    const clonedResponse = response.clone();
    const bodyText = await clonedResponse.text();
    console.log("Response body:", bodyText);
  } catch (error) {
    console.log("Unable to log response body:", error);
  }

  const allowedOrigin = "https://shared-services.eu.pvh.cloud";
  const requestOrigin = event.request.headers.get("Origin");

  // Create a new response with the same body but new headers
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });

  // Set CORS headers
  if (
    requestOrigin &&
    (requestOrigin === allowedOrigin ||
      requestOrigin.endsWith(".shared-services.eu.pvh.cloud"))
  ) {
    newResponse.headers.set("Access-Control-Allow-Origin", requestOrigin);
  } else {
    newResponse.headers.set("Access-Control-Allow-Origin", allowedOrigin);
  }

  newResponse.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  newResponse.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );

  // Add security headers
  newResponse.headers.set("X-Frame-Options", "DENY");
  newResponse.headers.set("X-Content-Type-Options", "nosniff");
  newResponse.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Handle OPTIONS preflight requests
  if (event.request.method === "OPTIONS") {
    return new Response(null, {
      headers: newResponse.headers,
    });
  }

  // Log the response after processing
  console.log("Response after processing:", {
    status: newResponse.status,
    headers: Object.fromEntries(newResponse.headers.entries()),
  });

  return newResponse;
};
