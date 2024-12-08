import { getAPIHeaders } from './apiUtils';
import { getTracker } from '../context/tracker';
import apm from '../../apm-config';

export function initDebugTools() {
    if (typeof window !== 'undefined' && import.meta.env.DEV) {
        (window as any).debugHeaders = async () => {
            console.group('🔍 Current Headers Status');
            let testTransaction = null;
            
            try {
                testTransaction = apm.startTransaction('debug-headers-test', 'debug', {
                    managed: true
                });
                
                // Add a simple span
                const span = testTransaction.startSpan('debug-headers');
                
                // Small delay to ensure transaction is registered
                await new Promise(resolve => setTimeout(resolve, 50));
                
                // Get headers with active transaction
                const headers = getAPIHeaders();
                const tracker = getTracker();
                
                console.log('Transaction State:', {
                    testTransactionId: testTransaction?.id,
                    currentTransactionId: apm.getCurrentTransaction()?.id,
                    active: !testTransaction?._end
                });
                
                console.log('Headers:', {
                    'Content-Type': headers['Content-Type'],
                    'x-openreplay-session-id': headers['x-openreplay-session-id'],
                    'traceparent': headers['traceparent'],
                    'tracestate': headers['tracestate']
                });
                
                console.log('OpenReplay Session:', tracker?.getSessionID());
                console.log('APM Transaction:', {
                    id: testTransaction?.id,
                    traceId: testTransaction?.traceId,
                    active: !testTransaction?._end,
                    isCurrent: apm.getCurrentTransaction() === testTransaction
                });
                
                // Add some duration
                await new Promise(resolve => setTimeout(resolve, 50));
                
                // End the span before transaction ends
                span?.end();
                
            } catch (error) {
                console.error('Failed to debug headers:', error);
            } finally {
                if (testTransaction) {
                    testTransaction.end();
                }
                console.groupEnd();
            }
        };

        console.log('🛠️ Debug tools initialized. Available commands:');
        console.log('- debugHeaders(): Show current headers and tracking IDs');
    }
} 