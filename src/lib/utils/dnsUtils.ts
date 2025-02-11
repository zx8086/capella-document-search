/* src/lib/utils/dnsUtils.ts */

import { log, warn } from "../../utils/unifiedLogger";

// Type definition for Bun's DNS cache stats
interface DnsCacheStats {
    size: number;
    cacheHitsCompleted: number;
    cacheHitsInflight: number;
    cacheMisses: number;
    errors: number;
    totalCount: number;
}

let bunDns: { 
    prefetch: (hostname: string) => void;
    getCacheStats: () => DnsCacheStats;
} | null = null;

// Initialize Bun DNS if available
try {
    // Using dynamic import to avoid issues in non-Bun environments
    if (process.versions?.bun) {
        import('bun').then(bun => {
            bunDns = bun.dns;
        }).catch(err => {
            warn('Failed to initialize Bun DNS:', err);
        });
    }
} catch (error) {
    warn('Bun DNS initialization error:', error);
}

// Safe DNS prefetch function that works in both Bun and non-Bun environments
export async function safeDnsPrefetch(hostnames: string[]): Promise<void> {
    if (!bunDns) {
        log('DNS prefetch skipped - Bun DNS not available');
        return;
    }

    for (const hostname of hostnames) {
        try {
            bunDns.prefetch(hostname);
            log(`DNS prefetch successful for ${hostname}`);
        } catch (error) {
            warn(`DNS prefetch failed for ${hostname}:`, error);
        }
    }
}

// Get DNS cache stats safely
export function getDnsCacheStats(): DnsCacheStats | null {
    if (!bunDns) {
        return null;
    }

    try {
        return bunDns.getCacheStats();
    } catch (error) {
        warn('Failed to get DNS cache stats:', error);
        return null;
    }
}

// Log DNS cache effectiveness
export function logDnsCacheEffectiveness(): void {
    const stats = getDnsCacheStats();
    if (!stats) {
        log('DNS cache stats not available');
        return;
    }

    const hitRate = stats.totalCount > 0 
        ? (stats.cacheHitsCompleted / stats.totalCount) * 100 
        : 0;

    log('DNS Cache Effectiveness:', {
        hitRate: `${hitRate.toFixed(2)}%`,
        hits: stats.cacheHitsCompleted,
        misses: stats.cacheMisses,
        totalQueries: stats.totalCount,
        cacheSize: stats.size,
        errors: stats.errors
    });
} 