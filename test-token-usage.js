// Test script to verify token usage tracking
async function testTokenUsage() {
  try {
    const response = await fetch('http://localhost:5173/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'What is Couchbase?',
        provider: 'AWS_KNOWLEDGE_BASE',
        userId: 'test-user-123',
        userName: 'Test User',
        userEmail: 'test@example.com',
        conversationId: 'test-conv-' + Date.now(),
        conversation: []
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      fullResponse += chunk;
      
      // Log each chunk to see the response structure
      console.log('Chunk received:', chunk.substring(0, 100));
    }

    console.log('\n=== Test completed ===');
    console.log('Full response length:', fullResponse.length);
    
    // Check logs for token usage information
    console.log('\nCheck the server logs for token usage details!');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
console.log('Starting token usage test...');
testTokenUsage();