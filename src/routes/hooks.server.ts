/* src/routes/hooks.server.ts */

import type { Handle } from "@sveltejs/kit";

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });

  // Production origin and development check
  const PROD_ORIGIN = "https://shared-services.eu.pvh.cloud";
  const isDevelopment = import.meta.env.DEV;
  const requestOrigin = event.request.headers.get("Origin");

  // CORS headers
  if (requestOrigin) {
    if (isDevelopment && requestOrigin.includes("localhost")) {
      // Allow localhost in development
      newResponse.headers.set("Access-Control-Allow-Origin", requestOrigin);
    } else if (
      requestOrigin === PROD_ORIGIN ||
      requestOrigin.endsWith(".shared-services.eu.pvh.cloud")
    ) {
      // Allow production domain and its subdomains
      newResponse.headers.set("Access-Control-Allow-Origin", requestOrigin);
    } else {
      // Default to production origin
      newResponse.headers.set("Access-Control-Allow-Origin", PROD_ORIGIN);
    }
  }

  newResponse.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  newResponse.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  newResponse.headers.set("Access-Control-Allow-Credentials", "true");

  // Remove any existing CSP headers to avoid conflicts
  newResponse.headers.delete("Content-Security-Policy");
  newResponse.headers.delete("Content-Security-Policy-Report-Only");

  // CSP headers based on environment
  const cspDirectives = isDevelopment
    ? `
      default-src 'self';
      script-src 'self' 'unsafe-inline' 'unsafe-eval';
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: blob:;
      font-src 'self';
      connect-src 'self' *;
      base-uri 'self';
      form-action 'self';
      worker-src 'self' blob:;
      frame-ancestors 'none';
    `
    : `
      default-src 'self' ${PROD_ORIGIN};
      script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vjs.zencdn.net ${PROD_ORIGIN};
      style-src 'self' 'unsafe-inline' ${PROD_ORIGIN};
      img-src 'self' data: blob: ${PROD_ORIGIN};
      font-src 'self' ${PROD_ORIGIN};
      connect-src 'self' ${PROD_ORIGIN} *.shared-services.eu.pvh.cloud;
      base-uri 'self';
      form-action 'self';
      frame-ancestors 'none';
      worker-src 'self' blob:;
      media-src 'self' blob: ${PROD_ORIGIN};
    `;

  // Set the new CSP header
  newResponse.headers.set(
    "Content-Security-Policy",
    cspDirectives.replace(/\s+/g, " ").trim(),
  );

  // Security headers (only in production)
  if (!isDevelopment) {
    newResponse.headers.set("X-Frame-Options", "DENY");
    newResponse.headers.set("X-Content-Type-Options", "nosniff");
    newResponse.headers.set(
      "Referrer-Policy",
      "strict-origin-when-cross-origin",
    );
    newResponse.headers.set("X-XSS-Protection", "1; mode=block");
    newResponse.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }

  // Handle OPTIONS preflight requests
  if (event.request.method === "OPTIONS") {
    return new Response(null, {
      headers: newResponse.headers,
    });
  }

  return newResponse;
};
