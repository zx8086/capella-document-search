import { backendConfig } from "../../backend-config";
import { frontendConfig } from "../../frontend-config";
import { safeDnsPrefetch } from "../../lib/utils/dnsUtils";

// Helper to safely extract hostname from URL string
const getHostname = (url: string): string | null => {
    try {
        return new URL(url).hostname;
    } catch {
        return null;
    }
};

// Define DNS prefetch targets by category
export const dnsPrefetchTargets = {
    // API Endpoints
    api: [
        getHostname(backendConfig.application.GRAPHQL_ENDPOINT),
        getHostname(backendConfig.capella.API_BASE_URL),
        'api.openai.com',
        'api.pinecone.io'
    ],

    // Monitoring & APM
    monitoring: [
        getHostname(frontendConfig.elasticApm.SERVER_URL),
        getHostname(frontendConfig.openreplay.INGEST_POINT),
        getHostname(backendConfig.openTelemetry.TRACES_ENDPOINT),
        getHostname(backendConfig.openTelemetry.METRICS_ENDPOINT),
        getHostname(backendConfig.openTelemetry.LOGS_ENDPOINT)
    ],

    // Authentication
    auth: [
        'login.microsoftonline.com'
    ],

    // Content Delivery
    cdn: [
        'd2bgp0ri487o97.cloudfront.net'
    ]
} as const;

// Helper to get all unique, valid hostnames for a given category
export function getDnsPrefetchTargets(categories: (keyof typeof dnsPrefetchTargets)[] = Object.keys(dnsPrefetchTargets) as any): string[] {
    const hostnames = categories
        .flatMap(category => dnsPrefetchTargets[category])
        .filter((hostname): hostname is string => 
            hostname !== null && 
            hostname !== undefined && 
            hostname !== ''
        );
    
    // Remove duplicates and localhost
    return [...new Set(hostnames)]
        .filter(hostname => 
            !hostname.includes('localhost') && 
            !hostname.includes('127.0.0.1')
        );
}

// Helper to prefetch DNS for specific categories
export async function prefetchDnsForCategories(categories: (keyof typeof dnsPrefetchTargets)[]): Promise<void> {
    const targets = getDnsPrefetchTargets(categories);
    await safeDnsPrefetch(targets);
}

// Export the type for use in other files
export type DnsPrefetchCategory = keyof typeof dnsPrefetchTargets; 