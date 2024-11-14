import type { LayoutLoad } from './$types';
import { auth } from '$lib/stores/authStore';
import { browser } from '$app/environment';

export const load: LayoutLoad = async () => {
    if (browser) {
        await auth.initialize();
    }
    return {};
}; 