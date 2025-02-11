/* src/lib/utils/storage.ts */

import { browser } from '$app/environment';

interface StorageOperation {
    operation: 'get' | 'set' | 'remove';
    key: string;
    value?: string;
    success: boolean;
    error?: string;
    context?: string;
}

export const storageAccess = {
    isAvailable(): boolean {
        if (!browser) return false;
        
        try {
            const testKey = '__storage_test__';
            localStorage.setItem(testKey, testKey);
            localStorage.removeItem(testKey);
            
            console.debug('Storage access check', {
                available: true,
                context: 'storage_check',
                userAgent: browser ? window.navigator.userAgent : 'non-browser'
            });
            
            return true;
        } catch (error) {
            console.warn('Storage access check failed', {
                error: error instanceof Error ? error.message : String(error),
                context: 'storage_check',
                userAgent: browser ? window.navigator.userAgent : 'non-browser'
            });
            
            return false;
        }
    },

    get(key: string): string | null {
        const operation: StorageOperation = {
            operation: 'get',
            key,
            success: false
        };

        if (!browser) {
            operation.error = 'Non-browser context';
            console.debug('Storage operation', operation);
            return null;
        }

        try {
            const value = localStorage.getItem(key);
            operation.success = true;
            operation.value = value || undefined;
            
            console.debug('Storage operation', operation);
            return value;
        } catch (error) {
            operation.error = error instanceof Error ? error.message : String(error);
            operation.context = this.getErrorContext(error);
            
            console.warn('Storage operation failed', operation);
            return null;
        }
    },

    set(key: string, value: string): boolean {
        const operation: StorageOperation = {
            operation: 'set',
            key,
            value,
            success: false
        };

        if (!browser) {
            operation.error = 'Non-browser context';
            console.debug('Storage operation', operation);
            return false;
        }

        try {
            localStorage.setItem(key, value);
            operation.success = true;
            
            console.debug('Storage operation', operation);
            return true;
        } catch (error) {
            operation.error = error instanceof Error ? error.message : String(error);
            operation.context = this.getErrorContext(error);
            
            console.warn('Storage operation failed', operation);
            return false;
        }
    },

    remove(key: string): boolean {
        const operation: StorageOperation = {
            operation: 'remove',
            key,
            success: false
        };

        if (!browser) {
            operation.error = 'Non-browser context';
            console.debug('Storage operation', operation);
            return false;
        }

        try {
            localStorage.removeItem(key);
            operation.success = true;
            
            console.debug('Storage operation', operation);
            return true;
        } catch (error) {
            operation.error = error instanceof Error ? error.message : String(error);
            operation.context = this.getErrorContext(error);
            
            console.warn('Storage operation failed', operation);
            return false;
        }
    },

    getErrorContext(error: unknown): string {
        // Check if it's a Chrome extension context error
        if (error instanceof Error && 
            error.message.includes('not allowed from this context')) {
            return 'chrome_extension_context';
        }
        
        // Check for quota exceeded
        if (error instanceof Error && 
            error.name === 'QuotaExceededError') {
            return 'quota_exceeded';
        }
        
        // Check for private browsing mode
        if (error instanceof Error && 
            error.name === 'SecurityError') {
            return 'private_browsing';
        }
        
        return 'unknown';
    }
};

// Export a debug helper
export function debugStorageAccess(): void {
    if (!browser) return;
    
    console.group('🔒 Storage Access Debug Info');
    console.log('Storage Available:', storageAccess.isAvailable());
    console.log('User Agent:', window.navigator.userAgent);
    
    // Test operations
    const testKey = '__debug_test__';
    console.log('Set Operation:', storageAccess.set(testKey, 'test'));
    console.log('Get Operation:', storageAccess.get(testKey));
    console.log('Remove Operation:', storageAccess.remove(testKey));
    
    // Check incognito mode if possible
    try {
        const fs = window.RequestFileSystem || window.webkitRequestFileSystem;
        if (fs) {
            fs(window.TEMPORARY, 100, 
                () => console.log('Incognito: No'),
                () => console.log('Incognito: Yes')
            );
        }
    } catch (e) {
        console.log('Incognito detection not available');
    }
    
    console.groupEnd();
} 