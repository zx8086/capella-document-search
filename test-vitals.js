import { connect } from 'couchbase';
import { backendConfig } from './src/backend-config.js';

async function testVitals() {
    try {
        console.log('Connecting to Couchbase...');
        const cluster = await connect(backendConfig.capella.URL, {
            username: backendConfig.capella.USERNAME,
            password: backendConfig.capella.PASSWORD
        });
        
        console.log('Connected! Running system:vitals query...');
        
        // Test 1: Basic query
        const result1 = await cluster.query('SELECT * FROM system:vitals');
        const rows1 = await result1.rows;
        console.log(`\nTest 1 - Basic query: ${rows1.length} rows returned`);
        
        // Test 2: With LIMIT to see if it makes a difference
        const result2 = await cluster.query('SELECT * FROM system:vitals LIMIT 20');
        const rows2 = await result2.rows;
        console.log(`Test 2 - With LIMIT 20: ${rows2.length} rows returned`);
        
        // Test 3: Count query
        const result3 = await cluster.query('SELECT COUNT(*) as count FROM system:vitals');
        const rows3 = await result3.rows;
        console.log(`Test 3 - COUNT query: ${rows3[0].count} total rows`);
        
        // Test 4: Get all nodes for comparison
        const result4 = await cluster.query('SELECT * FROM system:nodes');
        const rows4 = await result4.rows;
        console.log(`Test 4 - system:nodes: ${rows4.length} nodes in cluster`);
        
        // Show node names from vitals
        console.log('\nNodes with vitals:');
        rows1.forEach(row => {
            console.log(`- ${row.vitals?.node || 'unknown'}`);
        });
        
        await cluster.close();
    } catch (error) {
        console.error('Error:', error);
    }
}

testVitals();