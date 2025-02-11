/* src/lib/utils/apiUtils.ts */

import { browser } from '$app/environment';
import { getTracker } from '$lib/context/tracker';
import apm from '../../apm-config';

export function getAPIHeaders(): HeadersInit {
    const headers: HeadersInit = {
        'Content-Type': 'application/json'
    };
    
    const tracker = getTracker();
    if (tracker) {
        const sessionId = tracker.getSessionID();
        if (sessionId) {
            headers['x-openreplay-session-id'] = sessionId;
        }
    }

    // Add APM trace context
    const currentTransaction = apm.getCurrentTransaction();
    if (currentTransaction && !currentTransaction._end) {
        // Get or create a span ID for the traceparent
        let spanId = currentTransaction.id;
        const activeSpan = currentTransaction.currentSpan;
        if (activeSpan && !activeSpan._end) {
            spanId = activeSpan.id;
        }
        
        // Create traceparent header
        const traceparent = `00-${currentTransaction.traceId}-${spanId}-01`;
        headers['traceparent'] = traceparent;
        
        if (currentTransaction.tracestate) {
            headers['tracestate'] = currentTransaction.tracestate;
        }
        
        // Debug log in development
        if (import.meta.env.DEV) {
            console.debug('APM Context for headers:', {
                traceId: currentTransaction.traceId,
                transactionId: currentTransaction.id,
                spanId,
                name: currentTransaction.name,
                traceparent,
                active: !currentTransaction._end
            });
        }
    } else if (import.meta.env.DEV) {
        console.debug('No active APM transaction when getting headers');
    }
    
    return headers;
} 

export function debugHeaders() {
    const headers = getAPIHeaders();
    const tracker = getTracker();
    
    // Start a test transaction explicitly
    const transaction = apm.startTransaction('debug-headers-test', 'debug');
    
    console.group('🔍 Current Headers Status');
    
    // Get headers again after starting transaction
    const updatedHeaders = getAPIHeaders();
    
    console.log('Headers:', {
        'Content-Type': updatedHeaders['Content-Type'],
        'x-openreplay-session-id': updatedHeaders['x-openreplay-session-id'],
        'traceparent': updatedHeaders['traceparent'],
        'tracestate': updatedHeaders['tracestate']
    });
    
    console.log('OpenReplay Session:', tracker?.getSessionID());
    console.log('APM Transaction:', {
        id: transaction?.id,
        traceId: transaction?.traceId,
        active: !!apm.getCurrentTransaction()
    });
    
    // Debug APM state
    console.log('APM State:', {
        isActive: !!apm,
        hasCurrentTransaction: !!apm.getCurrentTransaction(),
        transactionDetails: transaction ? {
            id: transaction.id,
            traceId: transaction.traceId,
            name: transaction.name,
            type: transaction.type
        } : null
    });
    
    // End the test transaction
    transaction?.end();
    
    console.groupEnd();
}

// Only add to window in browser environment
if (browser && import.meta.env.DEV) {
    (window as any).debugHeaders = debugHeaders;
    console.log('🛠️ Debug commands available:');
    console.log('- debugHeaders(): Show current headers and tracking IDs');
}

// TypeScript declaration
declare global {
    interface Window {
        debugHeaders: () => void;
    }
}