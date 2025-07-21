// Test LangSmith tracing in SvelteKit API route following docs exactly
import { json } from '@sveltejs/kit';
import { traceable } from 'langsmith/traceable';

// Simple traceable function following docs pattern
const processMessage = traceable(
  async (message: string) => {
    console.log(`🔄 Processing message: ${message}`);
    
    // Simulate some processing work
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const result = {
      original: message,
      processed: `Processed: ${message}`,
      timestamp: new Date().toISOString(),
      success: true
    };
    
    console.log(`✅ Processing complete: ${JSON.stringify(result)}`);
    return result;
  },
  { 
    name: "API Message Processor",
    tags: ["api", "test", "processing"]
  }
);

export async function GET({ url }) {
  try {
    const message = url.searchParams.get('message') || 'Default test message';
    
    console.log(`📥 API request received with message: ${message}`);
    
    // Use traceable function
    const result = await processMessage(message);
    
    return json({
      success: true,
      data: result,
      tracing: "LangSmith traceable executed successfully"
    });
    
  } catch (error) {
    console.error('❌ API error:', error);
    return json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}