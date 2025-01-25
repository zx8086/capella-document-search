import type { PageLoad } from './$types';
import { getFlag } from '$lib/stores/featureFlagStore';

export const load: PageLoad = async ({ fetch, url, depends }) => {
    // Add a dependency on our custom identifier
    depends('app:health-check');
    
    const checkType = url.searchParams.get('type') || 'Simple';
    const response = await fetch(`/api/health-check?type=${checkType}`);
    const healthStatus = await response.json();
    
    // Check feature flag during load
    const showBuildInfo = getFlag('build-information');
    
    return {
        healthStatus,
        checkType: checkType as 'Simple' | 'Detailed',
        showBuildInfo
    };
}; 