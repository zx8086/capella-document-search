// Test script to verify traceable import
import { traceable } from 'langsmith/traceable';

console.log('traceable imported successfully:', typeof traceable);

// Test the traceable function
const testFn = traceable(
  () => {
    return 'Hello from traceable!';
  },
  { name: 'test-function' }
);

console.log('Test function result:', testFn());