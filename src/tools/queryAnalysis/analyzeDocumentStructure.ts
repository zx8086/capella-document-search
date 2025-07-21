/* src/tools/queryAnalysis/analyzeDocumentStructure.ts */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Bucket } from "couchbase";
import { z } from "zod";
import { logger } from "../../lib/logger";

export default (server: McpServer, bucket: Bucket) => {
  server.tool(
    "analyze_document_structure",
    "Analyze the structure of a document type",
    {
      document_key: z.string().describe("Document key to analyze"),
      scope_name: z.string().optional().default("_default").describe("Scope name"),
      collection_name: z.string().optional().default("_default").describe("Collection name"),
    },
    async ({ document_key, scope_name, collection_name }) => {
      logger.info("Analyzing document structure", { document_key, scope_name, collection_name });
      
      try {
        // Get the document
        const collection = bucket.scope(scope_name).collection(collection_name);
        const result = await collection.get(document_key);
        const document = result.content;
        
        // Analyze document structure
        const analysis = analyzeStructure(document);
        
        return {
          content: [
            {
              type: "text",
              text: formatAnalysis(document_key, document, analysis)
            }
          ]
        };
      } catch (error) {
        logger.error(`Error analyzing document structure: ${error instanceof Error ? error.message : String(error)}`);
        
        return {
          content: [
            {
              type: "text",
              text: `## Error Analyzing Document Structure\n\n${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
};

interface StructureAnalysis {
  fieldCount: number;
  depth: number;
  arrayFields: string[];
  objectFields: string[];
  primitiveFields: {[key: string]: string};
  nullFields: string[];
  nestedCollections: {[key: string]: number};
  sizeEstimate: number;
}

function analyzeStructure(document: any): StructureAnalysis {
  const analysis: StructureAnalysis = {
    fieldCount: 0,
    depth: 0,
    arrayFields: [],
    objectFields: [],
    primitiveFields: {},
    nullFields: [],
    nestedCollections: {},
    sizeEstimate: 0
  };
  
  function analyzeField(path: string, value: any, depth: number): void {
    analysis.fieldCount++;
    analysis.depth = Math.max(analysis.depth, depth);
    
    if (value === null) {
      analysis.nullFields.push(path);
    } else if (Array.isArray(value)) {
      analysis.arrayFields.push(path);
      analysis.nestedCollections[path] = value.length;
      
      // Analyze array items
      value.forEach((item, index) => {
        analyzeField(`${path}[${index}]`, item, depth + 1);
      });
    } else if (typeof value === 'object') {
      analysis.objectFields.push(path);
      
      // Analyze object fields
      Object.entries(value).forEach(([key, val]) => {
        analyzeField(`${path}.${key}`, val, depth + 1);
      });
    } else {
      // Primitive value
      analysis.primitiveFields[path] = typeof value;
      
      // Estimate size contribution
      if (typeof value === 'string') {
        analysis.sizeEstimate += value.length * 2; // UTF-16 chars
      } else if (typeof value === 'number') {
        analysis.sizeEstimate += 8; // Assuming double (64 bits)
      } else if (typeof value === 'boolean') {
        analysis.sizeEstimate += 1;
      }
    }
  }
  
  // Start analysis from root
  Object.entries(document).forEach(([key, value]) => {
    analyzeField(key, value, 1);
  });
  
  // Add overhead for object structure
  analysis.sizeEstimate += Object.keys(document).length * 24; // key references etc.
  
  return analysis;
}

function formatAnalysis(documentKey: string, document: any, analysis: StructureAnalysis): string {
  let output = `# Document Structure Analysis: ${documentKey}\n\n`;
  
  // Basic statistics
  output += `## Basic Statistics\n\n`;
  output += `- **Total Fields:** ${analysis.fieldCount}\n`;
  output += `- **Maximum Nesting Depth:** ${analysis.depth}\n`;
  output += `- **Number of Arrays:** ${analysis.arrayFields.length}\n`;
  output += `- **Number of Nested Objects:** ${analysis.objectFields.length}\n`;
  output += `- **Number of Primitive Fields:** ${Object.keys(analysis.primitiveFields).length}\n`;
  output += `- **Estimated Size:** ~${Math.round(analysis.sizeEstimate / 1024)} KB\n\n`;
  
  // Document overview
  output += `## Document Overview\n\n`;
  output += "```json\n";
  output += JSON.stringify(document, null, 2);
  output += "\n```\n\n";
  
  // Field breakdown
  output += `## Field Type Breakdown\n\n`;
  
  if (analysis.objectFields.length > 0) {
    output += `### Nested Objects (${analysis.objectFields.length})\n\n`;
    analysis.objectFields.forEach(field => {
      output += `- \`${field}\`\n`;
    });
    output += "\n";
  }
  
  if (analysis.arrayFields.length > 0) {
    output += `### Arrays (${analysis.arrayFields.length})\n\n`;
    analysis.arrayFields.forEach(field => {
      const count = analysis.nestedCollections[field] || 0;
      output += `- \`${field}\` - contains ${count} items\n`;
    });
    output += "\n";
  }
  
  if (Object.keys(analysis.primitiveFields).length > 0) {
    output += `### Primitive Fields (${Object.keys(analysis.primitiveFields).length})\n\n`;
    Object.entries(analysis.primitiveFields).forEach(([field, type]) => {
      output += `- \`${field}\`: ${type}\n`;
    });
    output += "\n";
  }
  
  if (analysis.nullFields.length > 0) {
    output += `### Null Fields (${analysis.nullFields.length})\n\n`;
    analysis.nullFields.forEach(field => {
      output += `- \`${field}\`\n`;
    });
    output += "\n";
  }
  
  // Indexing recommendations
  output += `## Indexing Recommendations\n\n`;
  output += `Based on document structure analysis, consider the following indexes:\n\n`;
  
  // Suggest indexes for string fields that might be good candidates
  const potentialIndexFields = Object.entries(analysis.primitiveFields)
    .filter(([field, type]) => 
      type === 'string' && 
      !field.includes('[') && // Skip array elements
      field.split('.').length <= 2 // Top-level or one level nested
    )
    .map(([field]) => field);
    
  if (potentialIndexFields.length > 0) {
    output += `### Potential Index Fields\n\n`;
    potentialIndexFields.forEach(field => {
      output += `- \`${field}\`: CREATE INDEX idx_${field.replace(/\./g, '_')} ON \`default\`.\`${documentKey.split(':')[0]}\` (${field});\n`;
    });
    output += "\n";
  }
  
  // Performance considerations
  output += `## Performance Considerations\n\n`;
  
  if (analysis.depth > 5) {
    output += `- **Deep Nesting:** Document has deep nesting (${analysis.depth} levels), which may impact query performance for deeply nested fields.\n`;
  }
  
  if (analysis.arrayFields.length > 0) {
    output += `- **Arrays:** Document contains ${analysis.arrayFields.length} arrays. Consider using UNNEST for efficient querying of array elements.\n`;
  }
  
  if (analysis.fieldCount > 50) {
    output += `- **Large Field Count:** Document has ${analysis.fieldCount} fields, which may increase overhead. Consider if all fields are necessary.\n`;
  }
  
  const largeArrays = Object.entries(analysis.nestedCollections)
    .filter(([_, count]) => count > 100)
    .map(([field, count]) => `${field} (${count} items)`);
    
  if (largeArrays.length > 0) {
    output += `- **Large Arrays:** Document contains large arrays that might impact performance: ${largeArrays.join(', ')}.\n`;
  }
  
  return output;
}
