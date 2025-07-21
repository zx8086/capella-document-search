/* src/tools/getScopesAndCollections.ts */

import type { Bucket } from "couchbase";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const getScopesAndCollectionsHandler = async (_params: {}, bucket: Bucket) => {
    const scopes = await bucket.collections().getAllScopes();
    const scopesCollections: Record<string, string[]> = {};
    
    for (const scope of scopes) {
        scopesCollections[scope.name] = scope.collections.map(c => c.name);
    }
    
    let formattedText = "Here are all the scopes and collections in the bucket:\n\n";
    
    Object.entries(scopesCollections).forEach(([scope, collections]) => {
        formattedText += `📁 Scope: ${scope}\n`;
        if (collections && collections.length > 0) {
            collections.forEach(collection => {
                formattedText += `  └─ 📄 Collection: ${collection}\n`;
            });
        } else {
            formattedText += '  └─ (No collections)\n';
        }
        formattedText += '\n';
    });
    
    return {
        content: [{
            type: "text" as const,
            text: formattedText
        }]
    };
};

export default (server: McpServer, bucket: Bucket) => {
    server.tool(
        "get_scopes_and_collections",
        "Get all scopes and collections in the bucket",
        {},
        async (params: any) => {
            if (!params || typeof params !== 'object') {
                throw new Error("Missing required arguments object");
            }
            return getScopesAndCollectionsHandler(params, bucket);
        }
    );
};

interface Collection {
    name: string;
}