// Test LangSmith token tracking with BedrockChatService
import { BedrockChatService } from './src/lib/services/bedrock-chat.ts';
import { Client } from 'langsmith';
import { RunTree } from 'langsmith/run_trees';

async function testLangSmithTokens() {
  console.log('Testing LangSmith token tracking...');
  
  try {
    // Create LangSmith client
    const langsmithClient = new Client({
      apiKey: process.env.LANGSMITH_API_KEY || Bun.env.LANGSMITH_API_KEY,
    });
    
    // Create a parent run for the test
    const parentRun = new RunTree({
      name: 'Test Token Tracking',
      run_type: 'chain',
      inputs: { test: true },
      project_name: process.env.LANGSMITH_PROJECT || Bun.env.LANGSMITH_PROJECT || 'capella-document-search',
    });
    
    await parentRun.postRun();
    
    // Get trace headers from the parent run
    const traceHeaders = parentRun.toHeaders();
    console.log('Trace headers:', Object.keys(traceHeaders));
    
    // Create BedrockChat service
    const service = new BedrockChatService('eu-central-1');
    
    const messages = [
      { role: 'user', content: 'What is the capital of France? Keep your answer brief.' }
    ];
    
    console.log('Sending request with trace headers...');
    const generator = service.createChatCompletion(messages, {
      temperature: 0.7,
      max_tokens: 50,
      traceHeaders: traceHeaders
    });
    
    let response = '';
    for await (const chunk of generator) {
      response += chunk;
    }
    
    console.log('Response:', response);
    
    // End the parent run
    await parentRun.end({ outputs: { response } });
    await parentRun.patchRun();
    
    // Wait a bit for LangSmith to process
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check the run in LangSmith
    console.log('\n✅ Test completed!');
    console.log(`Check the run in LangSmith: https://smith.langchain.com/public/${parentRun.id}/r`);
    console.log('Project:', parentRun.project_name);
    console.log('Run ID:', parentRun.id);
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testLangSmithTokens();