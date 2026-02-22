// src/lib/graphql/index.ts

import { backendConfig } from "$backendConfig";
import { HoudiniClient } from "$houdini";

// Use the same endpoint as the existing Apollo client
export default new HoudiniClient({
  url: backendConfig.application.GRAPHQL_ENDPOINT,
  fetchParams() {
    return {
      headers: {
        "Content-Type": "application/json",
      },
    };
  },
});
