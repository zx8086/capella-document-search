import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, url }) => {
    const checkType = url.searchParams.get('type') || 'Simple';
    const response = await fetch(`/api/health-check?type=${checkType}`);
    const initialData = await response.json();
    
    return {
        healthStatus: initialData,
        checkType: checkType as 'Simple' | 'Detailed'
    };
}; 