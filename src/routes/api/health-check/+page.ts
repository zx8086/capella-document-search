import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
    // Initial load with Simple check
    const response = await fetch(`/api/health-check?type=Simple`);
    const initialData = await response.json();
    
    return {
        healthStatus: initialData,
        checkType: 'Simple' as const
    };
}; 