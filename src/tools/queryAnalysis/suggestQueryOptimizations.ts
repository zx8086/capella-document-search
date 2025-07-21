/* src/tools/queryAnalysis/suggestQueryOptimizations.ts */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Bucket } from "couchbase";
import { z } from "zod";
import { logger } from "../../lib/logger";

export default (server: McpServer, bucket: Bucket) => {
  server.tool(
    "suggest_query_optimizations",
    "Analyze a query and suggest optimizations and indexes",
    {
      query: z.string().describe("The N1QL query to analyze"),
      bucket_name: z.string().optional().describe("Bucket name (defaults to bucket in query)"),
      scope_name: z.string().optional().describe("Scope name (defaults to scope in query)"),
      collection_name: z.string().optional().describe("Collection name (defaults to collection in query)"),
    },
    async ({ query, bucket_name, scope_name, collection_name }) => {
      logger.info("Analyzing query for optimizations", { query, bucket_name, scope_name, collection_name });
      
      try {
        // Analyze the query
        const analysis = analyzeQuery(query);
        
        // Extract bucket, scope, collection if not provided
        const { extractedBucket, extractedScope, extractedCollection } = extractQueryComponents(query);
        
        const targetBucket = bucket_name || extractedBucket || bucket.name;
        const targetScope = scope_name || extractedScope || "_default";
        const targetCollection = collection_name || extractedCollection || "_default";
        
        // Format suggestions
        return {
          content: [
            {
              type: "text",
              text: formatOptimizationSuggestions(query, analysis, targetBucket, targetScope, targetCollection)
            }
          ]
        };
      } catch (error) {
        logger.error(`Error analyzing query: ${error instanceof Error ? error.message : String(error)}`);
        
        return {
          content: [
            {
              type: "text",
              text: `## Error Analyzing Query\n\n${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
};

interface QueryAnalysis {
  queryType: string;
  predicates: string[];
  projectedFields: string[];
  orderByFields: string[];
  groupByFields: string[];
  joinClauses: string[];
  hasPagination: boolean;
  hasLimit: boolean;
  hasOffset: boolean;
  hasAggregate: boolean;
  usesPrimaryKey: boolean;
  complexityScore: number;
}

function analyzeQuery(query: string): QueryAnalysis {
  const analysis: QueryAnalysis = {
    queryType: 'SELECT', // Default
    predicates: [],
    projectedFields: [],
    orderByFields: [],
    groupByFields: [],
    joinClauses: [],
    hasPagination: false,
    hasLimit: false,
    hasOffset: false,
    hasAggregate: false,
    usesPrimaryKey: false,
    complexityScore: 0
  };
  
  // Convert to uppercase for case-insensitive matching but preserve original for extraction
  const upperQuery = query.toUpperCase();
  
  // Determine query type
  if (upperQuery.includes('SELECT')) {
    analysis.queryType = 'SELECT';
  } else if (upperQuery.includes('UPDATE')) {
    analysis.queryType = 'UPDATE';
  } else if (upperQuery.includes('DELETE')) {
    analysis.queryType = 'DELETE';
  } else if (upperQuery.includes('INSERT')) {
    analysis.queryType = 'INSERT';
  } else if (upperQuery.includes('MERGE')) {
    analysis.queryType = 'MERGE';
  }
  
  // Extract WHERE predicates
  const whereMatch = upperQuery.match(/WHERE\s+(.*?)(?:ORDER BY|GROUP BY|LIMIT|OFFSET|HAVING|$)/is);
  if (whereMatch && whereMatch[1]) {
    // Split by AND/OR and clean up
    const predicates = whereMatch[1]
      .split(/\s+(?:AND|OR)\s+/i)
      .map(p => p.trim())
      .filter(p => p.length > 0);
    
    analysis.predicates = predicates;
    
    // Check for META().id which indicates primary key usage
    if (whereMatch[1].toUpperCase().includes('META().ID') || whereMatch[1].includes('meta().id')) {
      analysis.usesPrimaryKey = true;
    }
  }
  
  // Extract projected fields
  const selectMatch = upperQuery.match(/SELECT\s+(.*?)\s+FROM/is);
  if (selectMatch && selectMatch[1]) {
    if (!selectMatch[1].includes('*')) {
      // Split by commas, but handle function calls carefully
      let inFunction = 0;
      let currentField = '';
      const projectedFields = [];
      
      for (let i = 0; i < selectMatch[1].length; i++) {
        const char = selectMatch[1][i];
        if (char === '(') inFunction++;
        if (char === ')') inFunction--;
        
        if (char === ',' && inFunction === 0) {
          projectedFields.push(currentField.trim());
          currentField = '';
        } else {
          currentField += char;
        }
      }
      
      if (currentField.trim()) {
        projectedFields.push(currentField.trim());
      }
      
      analysis.projectedFields = projectedFields;
      
      // Check for aggregates
      const hasAggregate = projectedFields.some(f => 
        /\b(COUNT|SUM|AVG|MIN|MAX|ARRAY_AGG)\s*\(/i.test(f)
      );
      analysis.hasAggregate = hasAggregate;
    }
  }
  
  // Extract ORDER BY fields
  const orderByMatch = upperQuery.match(/ORDER BY\s+(.*?)(?:LIMIT|OFFSET|$)/is);
  if (orderByMatch && orderByMatch[1]) {
    const orderByFields = orderByMatch[1]
      .split(',')
      .map(f => f.trim().split(/\s+/)[0]) // Remove ASC/DESC
      .filter(f => f.length > 0);
    
    analysis.orderByFields = orderByFields;
  }
  
  // Extract GROUP BY fields
  const groupByMatch = upperQuery.match(/GROUP BY\s+(.*?)(?:HAVING|ORDER BY|LIMIT|OFFSET|$)/is);
  if (groupByMatch && groupByMatch[1]) {
    const groupByFields = groupByMatch[1]
      .split(',')
      .map(f => f.trim())
      .filter(f => f.length > 0);
    
    analysis.groupByFields = groupByFields;
  }
  
  // Check for JOIN clauses
  const joinMatches = upperQuery.match(/\b(JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN)\b/ig);
  if (joinMatches) {
    analysis.joinClauses = joinMatches;
  }
  
  // Check for pagination
  analysis.hasLimit = upperQuery.includes('LIMIT');
  analysis.hasOffset = upperQuery.includes('OFFSET');
  analysis.hasPagination = analysis.hasLimit || analysis.hasOffset;
  
  // Calculate complexity score (higher means more complex)
  analysis.complexityScore = 1; // Start with base score
  
  if (analysis.predicates.length > 0) analysis.complexityScore += analysis.predicates.length;
  if (analysis.orderByFields.length > 0) analysis.complexityScore += analysis.orderByFields.length;
  if (analysis.groupByFields.length > 0) analysis.complexityScore += analysis.groupByFields.length * 2;
  if (analysis.joinClauses.length > 0) analysis.complexityScore += analysis.joinClauses.length * 3;
  if (analysis.hasAggregate) analysis.complexityScore += 2;
  
  return analysis;
}

function extractQueryComponents(query: string): { 
  extractedBucket: string | null; 
  extractedScope: string | null; 
  extractedCollection: string | null; 
} {
  // Default values
  let extractedBucket = null;
  let extractedScope = null;
  let extractedCollection = null;

  // Look for fully qualified path pattern: `bucket`.`scope`.`collection`
  const fqpMatch = query.match(/`([^`]+)`.`([^`]+)`.`([^`]+)`/);
  if (fqpMatch) {
    extractedBucket = fqpMatch[1];
    extractedScope = fqpMatch[2];
    extractedCollection = fqpMatch[3];
  }

  // If not found, try different patterns
  if (!extractedBucket && !extractedScope && !extractedCollection) {
    // Try to find bucket and collection without scope: `bucket`.`collection` or FROM bucket.collection
    const bcMatch = query.match(/(?:FROM|JOIN)\s+(?:`([^`]+)`\.`([^`]+)`|([^`,\s]+)\.([^`,\s]+))/i);
    if (bcMatch) {
      if (bcMatch[1] && bcMatch[2]) {
        extractedBucket = bcMatch[1];
        extractedCollection = bcMatch[2];
      } else if (bcMatch[3] && bcMatch[4]) {
        extractedBucket = bcMatch[3];
        extractedCollection = bcMatch[4];
      }
    }
  }

  return { extractedBucket, extractedScope, extractedCollection };
}

function formatOptimizationSuggestions(
  query: string, 
  analysis: QueryAnalysis,
  bucket: string,
  scope: string,
  collection: string
): string {
  let output = `# Query Optimization Suggestions\n\n`;
  
  // Show original query
  output += `## Original Query\n\n`;
  output += "```sql\n";
  output += query;
  output += "\n```\n\n";
  
  // Show analysis
  output += `## Query Analysis\n\n`;
  output += `- **Query Type:** ${analysis.queryType}\n`;
  output += `- **Complexity Score:** ${analysis.complexityScore} (higher = more complex)\n`;
  output += `- **Target:** \`${bucket}\`.\`${scope}\`.\`${collection}\`\n`;
  
  if (analysis.predicates.length > 0) {
    output += `- **WHERE Predicates:** ${analysis.predicates.length}\n`;
    analysis.predicates.forEach(p => {
      output += `  - ${p}\n`;
    });
  }
  
  if (analysis.orderByFields.length > 0) {
    output += `- **ORDER BY Fields:** ${analysis.orderByFields.join(', ')}\n`;
  }
  
  if (analysis.groupByFields.length > 0) {
    output += `- **GROUP BY Fields:** ${analysis.groupByFields.join(', ')}\n`;
  }
  
  if (analysis.joinClauses.length > 0) {
    output += `- **Join Clauses:** ${analysis.joinClauses.length}\n`;
  }
  
  output += `- **Uses Pagination:** ${analysis.hasPagination ? 'Yes' : 'No'}\n`;
  output += `- **Uses Primary Key:** ${analysis.usesPrimaryKey ? 'Yes' : 'No'}\n`;
  output += `- **Has Aggregations:** ${analysis.hasAggregate ? 'Yes' : 'No'}\n\n`;
  
  // Index recommendations
  output += `## Index Recommendations\n\n`;
  
  // If using primary key, that's optimal for lookups
  if (analysis.usesPrimaryKey && analysis.predicates.length === 1) {
    output += `- **Primary Index:** This query uses META().id for lookups, which is optimal for retrieving documents by ID.\n\n`;
  } else {
    // Generate index recommendations based on predicates and sort
    const indexableFields = new Set<string>();
    
    // Extract fields from predicates
    analysis.predicates.forEach(p => {
      // Extract field name (assumes format like "field = value" or "field IN [...]")
      const fieldMatch = p.match(/([a-zA-Z0-9_\.]+)\s*(?:=|!=|<|>|<=|>=|IN|LIKE|NOT LIKE|NOT NULL|IS NULL|IS NOT NULL)/i);
      if (fieldMatch && fieldMatch[1]) {
        indexableFields.add(fieldMatch[1].trim());
      }
    });
    
    // Add ORDER BY fields
    analysis.orderByFields.forEach(field => {
      indexableFields.add(field);
    });
    
    // Add GROUP BY fields
    analysis.groupByFields.forEach(field => {
      indexableFields.add(field);
    });
    
    // Convert to array and remove any meta().id (already addressed)
    const indexFields = Array.from(indexableFields)
      .filter(f => !f.toLowerCase().includes('meta().id'));
    
    if (indexFields.length > 0) {
      output += `### Recommended Index Statements\n\n`;
      
      // Simple index for each predicate field
      indexFields.forEach(field => {
        const safeField = field.replace(/\./g, '_');
        output += `\`\`\`sql\n`;
        output += `CREATE INDEX idx_${safeField} ON \`${bucket}\`.\`${scope}\`.\`${collection}\`(${field});\n`;
        output += `\`\`\`\n\n`;
      });
      
      // Composite index if multiple fields are used
      if (indexFields.length > 1) {
        // Create a composite index based on potential access patterns
        let compositeIndexFields = '';
        
        // Priority order: equality predicates, then range predicates, then ORDER BY/GROUP BY
        // For simplicity, we'll just use the fields as-is
        compositeIndexFields = indexFields.join(', ');
        
        const safeIndexName = `idx_composite_${indexFields.map(f => f.replace(/\./g, '_')).join('_')}`;
        
        output += `### Composite Index (Covers Multiple Fields)\n\n`;
        output += `\`\`\`sql\n`;
        output += `CREATE INDEX ${safeIndexName} ON \`${bucket}\`.\`${scope}\`.\`${collection}\`(${compositeIndexFields});\n`;
        output += `\`\`\`\n\n`;
      }
      
      // Covering index if appropriate
      if (analysis.projectedFields.length > 0 && !analysis.projectedFields.includes('*')) {
        // Get projected fields that aren't already in our index
        const coveringFields = analysis.projectedFields
          .filter(field => {
            // Extract field name from projections (handles aliases like "field AS alias")
            const cleanField = field.split(/\s+AS\s+/i)[0].trim();
            // Remove function calls
            if (cleanField.includes('(')) return false;
            // Only include if not already in index fields
            return !indexFields.includes(cleanField);
          });
        
        if (coveringFields.length > 0 && indexFields.length > 0) {
          output += `### Covering Index (Includes Projected Fields)\n\n`;
          output += `\`\`\`sql\n`;
          output += `CREATE INDEX idx_covering ON \`${bucket}\`.\`${scope}\`.\`${collection}\`(${indexFields.join(', ')}) INCLUDE (${coveringFields.join(', ')});\n`;
          output += `\`\`\`\n\n`;
          output += `A covering index includes all fields needed by the query, eliminating the need for document fetch.\n\n`;
        }
      }
    } else {
      output += `No specific index recommendations based on the query. Consider adding a primary index if one doesn't exist:\n\n`;
      output += `\`\`\`sql\n`;
      output += `CREATE PRIMARY INDEX ON \`${bucket}\`.\`${scope}\`.\`${collection}\`;\n`;
      output += `\`\`\`\n\n`;
    }
  }
  
  // Query optimization suggestions
  output += `## Query Optimization Suggestions\n\n`;
  
  // Suggest improvements based on analysis
  const suggestions = [];
  
  // Check for missing LIMIT
  if (!analysis.hasLimit) {
    suggestions.push(
      "**Add LIMIT Clause:** Consider adding a LIMIT clause to prevent returning too many results, which can impact performance."
    );
  }
  
  // Check for wildcard projections
  if (analysis.projectedFields.length === 0) {
    suggestions.push(
      "**Avoid SELECT * Projections:** Specify only the fields you need instead of using SELECT * to reduce network traffic and improve performance."
    );
  }
  
  // Check for high complexity
  if (analysis.complexityScore > 10) {
    suggestions.push(
      "**Consider Query Splitting:** This query has high complexity. Consider breaking it into multiple simpler queries if possible."
    );
  }
  
  // Check for efficient predicate usage
  if (analysis.predicates.length > 2) {
    suggestions.push(
      "**Optimize Predicates:** Ensure the most selective predicates (those that filter out the most documents) are listed first in your WHERE clause."
    );
  }
  
  // Check for efficient join usage
  if (analysis.joinClauses.length > 0) {
    suggestions.push(
      "**Optimize Joins:** Ensure smaller datasets are on the right side of the join. Consider using NEST or UNNEST for array relationships instead of JOIN when appropriate."
    );
  }
  
  // Suggestion for prepared statements
  suggestions.push(
    "**Use Prepared Statements:** If this query is executed frequently with different parameters, use prepared statements to improve performance."
  );
  
  // Add suggestions to output
  if (suggestions.length > 0) {
    suggestions.forEach(suggestion => {
      output += `- ${suggestion}\n\n`;
    });
  } else {
    output += "No specific optimization suggestions for this query.\n\n";
  }
  
  // Add EXPLAIN suggestion
  output += `## Next Steps\n\n`;
  output += `To further analyze this query, run EXPLAIN to see the query execution plan:\n\n`;
  output += `\`\`\`sql\n`;
  output += `EXPLAIN ${query}\n`;
  output += `\`\`\`\n\n`;
  output += `This will show how the query is executed and whether it utilizes indexes effectively.\n`;
  
  return output;
}
