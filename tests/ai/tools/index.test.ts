// tests/ai/tools/index.test.ts

import { describe, expect, it } from "bun:test";
import { allTools, toolsByName } from "$ai/tools";

describe("Tools Index", () => {
  describe("Tool Registration", () => {
    it("should export all 17 tools", () => {
      expect(allTools).toHaveLength(17);
    });

    it("should have unique tool names", () => {
      const names = allTools.map((tool) => tool.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });

    it("should have all tools in toolsByName mapping", () => {
      expect(Object.keys(toolsByName)).toHaveLength(17);
    });
  });

  describe("Cluster Tools", () => {
    it("should include get_system_vitals tool", () => {
      expect(toolsByName["get_system_vitals"]).toBeDefined();
      expect(toolsByName["get_system_vitals"].name).toBe("get_system_vitals");
    });

    it("should include get_system_nodes tool", () => {
      expect(toolsByName["get_system_nodes"]).toBeDefined();
      expect(toolsByName["get_system_nodes"].name).toBe("get_system_nodes");
    });
  });

  describe("Query Tools", () => {
    const queryToolNames = [
      "get_fatal_requests",
      "get_most_expensive_queries",
      "get_longest_running_queries",
      "get_most_frequent_queries",
      "get_largest_result_size_queries",
      "get_largest_result_count_queries",
      "get_primary_index_queries",
      "get_completed_requests",
    ];

    it.each(queryToolNames)("should include %s tool", (toolName) => {
      expect(toolsByName[toolName]).toBeDefined();
      expect(toolsByName[toolName].name).toBe(toolName);
    });
  });

  describe("Schema Tools", () => {
    it("should include get_schema_for_collection tool", () => {
      expect(toolsByName["get_schema_for_collection"]).toBeDefined();
    });

    it("should include run_sql_plus_plus_query tool", () => {
      expect(toolsByName["run_sql_plus_plus_query"]).toBeDefined();
    });
  });

  describe("Index Tools", () => {
    const indexToolNames = [
      "get_system_indexes",
      "get_prepared_statements",
      "get_indexes_to_drop",
      "get_detailed_indexes",
      "get_detailed_prepared_statements",
    ];

    it.each(indexToolNames)("should include %s tool", (toolName) => {
      expect(toolsByName[toolName]).toBeDefined();
      expect(toolsByName[toolName].name).toBe(toolName);
    });
  });

  describe("Tool Structure", () => {
    it("all tools should have name property", () => {
      for (const tool of allTools) {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe("string");
        expect(tool.name.length).toBeGreaterThan(0);
      }
    });

    it("all tools should have description property", () => {
      for (const tool of allTools) {
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe("string");
        expect(tool.description.length).toBeGreaterThan(0);
      }
    });

    it("all tools should have schema property", () => {
      for (const tool of allTools) {
        expect(tool.schema).toBeDefined();
      }
    });
  });
});
