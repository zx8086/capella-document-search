import { startInstrumentation } from "$lib/server/instrumentation";

startInstrumentation();

export async function handle({ event, resolve }) {
  // your existing handle logic
  return resolve(event);
}
