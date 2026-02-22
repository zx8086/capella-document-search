// hooks.server.ts
// SIO-366: SvelteKit native tracing integration

import type { Handle } from "@sveltejs/kit";
import { redirect } from "@sveltejs/kit";

const ENABLE_TRACING = (process.env.ENABLE_OPENTELEMETRY ?? Bun?.env?.ENABLE_OPENTELEMETRY) === "true";

// Define paths that should be public
const PUBLIC_PATHS = [
  "/login",
  "/_app", // All SvelteKit app assets
  "/build", // Built assets
  "/favicon.ico", // Favicon
  "/static", // Static assets
];

// Add specific asset extensions that should always be public
const PUBLIC_EXTENSIONS = [".css", ".js", ".woff", ".woff2", ".ttf", ".png", ".jpg", ".svg"];

// Add specific immutable paths
const IMMUTABLE_PATHS = ["/_app/immutable/", "/_app/version.json"];

export const handle: Handle = async ({ event, resolve }) => {
  const pathname = event.url.pathname;

  // SvelteKit native tracing - annotate root span (SIO-366)
  if (ENABLE_TRACING && event.tracing?.root) {
    event.tracing.root.setAttributes({
      "http.request.method": event.request.method,
      "url.path": pathname,
      "url.full": event.url.href,
      "user.authenticated": !!event.cookies.get("auth"),
      "http.route": pathname,
    });
  }

  // Check if path should be public
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  const hasPublicExtension = PUBLIC_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  const isImmutablePath = IMMUTABLE_PATHS.some((path) => pathname.startsWith(path));

  // Allow access to public paths and assets
  if (isPublicPath || hasPublicExtension || isImmutablePath) {
    const response = await resolve(event);
    // Add cache headers for immutable content
    if (isImmutablePath) {
      response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }
    // Add response status to span
    if (ENABLE_TRACING && event.tracing?.root) {
      event.tracing.root.setAttributes({
        "http.response.status_code": response.status,
        "event.outcome": response.ok ? "success" : "failure",
      });
    }
    return response;
  }

  // Authentication check for non-public paths
  const authCookie = event.cookies.get("auth");
  if (!authCookie) {
    if (ENABLE_TRACING && event.tracing?.root) {
      event.tracing.root.setAttributes({
        "http.response.status_code": 307,
        "event.outcome": "failure",
        "http.redirect.to": "/login",
      });
    }
    throw redirect(307, "/login");
  }

  const response = await resolve(event);

  // Add response status to span
  if (ENABLE_TRACING && event.tracing?.root) {
    event.tracing.root.setAttributes({
      "http.response.status_code": response.status,
      "event.outcome": response.ok ? "success" : "failure",
    });
  }

  // Add these headers
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  response.headers.set("Cross-Origin-Embedder-Policy", "require-corp");

  // Security headers - removing any that might conflict with CSP
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // Remove any existing CSP headers to prevent conflicts
  response.headers.delete("Content-Security-Policy");
  response.headers.delete("Content-Security-Policy-Report-Only");

  return response;
};
