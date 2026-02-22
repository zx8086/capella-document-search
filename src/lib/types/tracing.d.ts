// src/lib/types/tracing.d.ts
// SvelteKit event.tracing type augmentation (SIO-360)

import type { Span } from "@opentelemetry/api";

declare module "@sveltejs/kit" {
  interface RequestEventTracing {
    root: Span | null;
    current: Span | null;
  }

  interface RequestEvent {
    tracing?: RequestEventTracing;
  }
}
