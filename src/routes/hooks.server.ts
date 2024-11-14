/* src/routes/hooks.server.ts */

import type { Handle } from "@sveltejs/kit";
import { redirect } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  // List of public paths that don't require authentication
  const publicPaths = ['/login'];
  const isPublicPath = publicPaths.some(path => event.url.pathname.startsWith(path));

  // Check authentication for non-public paths
  if (!isPublicPath) {
    const authCookie = event.cookies.get('auth');
    if (!authCookie) {
      throw redirect(307, '/login');
    }
  }

  const response = await resolve(event);

  // Your existing security headers...
  response.headers.set('X-Frame-Options', 'DENY');
  // ... rest of your headers

  return response;
};