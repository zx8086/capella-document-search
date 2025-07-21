// Simple LangSmith traceable test following documentation exactly
import { traceable } from "langsmith/traceable";

// Test function exactly like the docs
const generateMessage = traceable(
  async (input) => {
    console.log(`Processing: ${input}`);
    
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return `Processed: ${input}`;
  },
  { name: "Simple Message Generator" }
);

// Test the function
async function main() {
  try {
    console.log("Testing traceable with LangSmith...");
    const result = await generateMessage("Hello World");
    console.log("Result:", result);
    console.log("✅ Traceable test completed successfully!");
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

main();