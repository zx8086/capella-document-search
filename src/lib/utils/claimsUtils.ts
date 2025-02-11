/* src/lib/utils/claimsUtils.ts */

import type { AccountInfo, IdTokenClaims } from '@azure/msal-browser';
import { log } from '$utils/unifiedLogger';

export interface ParsedClaims {
    username?: string;
    name?: string;
    email?: string;
    roles?: string[];
    expiration?: Date;
    isExpired: boolean;
}

export function parseTokenClaims(account: AccountInfo): ParsedClaims {
    const claims = account.idTokenClaims as IdTokenClaims;
    
    if (!claims) {
        return { isExpired: true };
    }

    const now = Math.floor(Date.now() / 1000);
    const expiration = claims.exp ? new Date(claims.exp * 1000) : undefined;
    
    return {
        username: account.username,
        name: claims.name,
        email: claims.email || claims.preferred_username,
        roles: Array.isArray(claims.roles) ? claims.roles : [],
        expiration,
        isExpired: claims.exp ? claims.exp < now : true
    };
}

export function validateTokenClaims(claims: ParsedClaims): boolean {
    if (claims.isExpired) {
        log('Token validation failed: Token is expired');
        return false;
    }

    if (!claims.username || !claims.email) {
        log('Token validation failed: Missing required claims');
        return false;
    }

    return true;
}

export function debugUserClaims(account: AccountInfo) {
    const claims = parseTokenClaims(account);
    const rawClaims = account.idTokenClaims;
    
    console.log('🔍 User Claims Debug');
    console.log('User Info:', claims);
    console.log('Raw Claims:', rawClaims);
    
    // Add photo-related claims debugging
    console.log('Photo-related claims:', {
        hasPhoto: !!rawClaims?.photo,
        photoUrl: rawClaims?.photo || 'Not available',
        objectId: rawClaims?.oid,
        upn: rawClaims?.upn,
        timestamp: new Date().toISOString()
    });

    if (validateTokenClaims(claims)) {
        console.log('✅ Token claims validation passed');
    }
} 