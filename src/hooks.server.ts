/* src/hooks.server.ts */

import { startInstrumentation } from "$lib/server/instrumentation";
startInstrumentation();
export async function handle({ event, resolve }) {
  return resolve(event);
}
