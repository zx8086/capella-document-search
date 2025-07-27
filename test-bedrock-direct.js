// Direct test of BedrockChatService
import { BedrockChatService } from './src/lib/services/bedrock-chat.ts';

async function testBedrock() {
  console.log('Testing BedrockChat directly...');
  
  try {
    const service = new BedrockChatService('eu-central-1');
    
    const messages = [
      { role: 'user', content: 'What is 2+2?' }
    ];
    
    console.log('Sending request...');
    const generator = service.createChatCompletion(messages, {
      temperature: 0.7,
      max_tokens: 100
    });
    
    let response = '';
    for await (const chunk of generator) {
      response += chunk;
    }
    
    console.log('Response:', response);
    
    // Check if token usage is available
    if (generator.tokenUsage) {
      console.log('Token usage:', generator.tokenUsage);
    } else {
      console.log('No token usage data available');
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

testBedrock();