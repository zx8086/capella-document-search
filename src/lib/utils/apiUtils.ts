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
    if (currentTransaction) {
        headers['traceparent'] = `00-${currentTransaction.traceId}-${currentTransaction.id}-01`;
        if (currentTransaction.tracestate) {
            headers['tracestate'] = currentTransaction.tracestate;
        }
    }
    
    return headers;
} 