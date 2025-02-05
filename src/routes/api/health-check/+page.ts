import type { PageLoad } from './$types';
import { getFlag } from '$lib/stores/featureFlagStore';

export const load: PageLoad = async ({ fetch, url, depends }) => {
    // Add a dependency on our custom identifier
    depends('app:health-check');
    
    try {
        const checkType = url.searchParams.get('type') || 'Simple';
        const response = await fetch(`/api/health-check?type=${checkType}`);
        
        // Check if response is ok before trying to parse JSON
        if (!response.ok) {
            throw new Error(`Health check failed with status: ${response.status}`);
        }

        // Try to parse JSON response
        let healthStatus;
        try {
            healthStatus = await response.json();
        } catch (e) {
            throw new Error('Invalid JSON response from health check endpoint');
        }
        
        // Check feature flag during load
        const showBuildInfo = getFlag('build-information');
        
        return {
            healthStatus,
            checkType: checkType as 'Simple' | 'Detailed',
            showBuildInfo
        };
    } catch (error) {
        // Return a structured error response
        return {
            healthStatus: {
                status: 'ERROR',
                message: error instanceof Error ? error.message : 'Unknown error occurred',
                checks: {},
                checkType: url.searchParams.get('type') || 'Simple'
            },
            checkType: 'Simple' as const,
            showBuildInfo: false
        };
    }
}; 