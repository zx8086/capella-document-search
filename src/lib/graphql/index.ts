// src/lib/graphql/index.ts

import { HoudiniClient } from '$houdini';
import { backendConfig } from '$backendConfig';

// Use the same endpoint as the existing Apollo client
export default new HoudiniClient({
    url: backendConfig.application.GRAPHQL_ENDPOINT,
    fetchParams() {
        return {
            headers: {
                'Content-Type': 'application/json',
            }
        };
    }
});