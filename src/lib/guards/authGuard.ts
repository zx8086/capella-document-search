// src/lib/guards/authGuard.ts

import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import { auth, authStore } from "$lib/stores/auth.svelte";

export async function authGuard(path: string): Promise<boolean> {
	if (!browser) return true;

	// Initialize auth if not already done
	await auth.initialize();

	// Check if user is authenticated
	if (!authStore.isAuthenticated) {
		// Store the intended destination
		sessionStorage.setItem("loginRedirectPath", path);
		// Redirect to login
		await goto("/login", { replaceState: true });
		return false;
	}

	return true;
}
