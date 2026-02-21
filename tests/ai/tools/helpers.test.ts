// tests/ai/tools/helpers.test.ts

import { describe, expect, it } from "bun:test";
import { formatToolResult, handleNoData } from "$ai/tools/helpers/no-data-handler";
import {
  periodToMilliseconds,
  resolveTimeframe,
  type Timeframe,
} from "$ai/tools/helpers/timeframe-resolver";

describe("Timeframe Resolver", () => {
  describe("resolveTimeframe", () => {
    it("should resolve explicit timeframe correctly", () => {
      const timeframe: Timeframe = {
        start_year: 2024,
        start_month: 1,
        end_year: 2024,
        end_month: 6,
      };

      const result = resolveTimeframe(undefined, timeframe);

      expect(result.startDate).toBe("2024-01-01");
      expect(result.endDate).toBe("2024-06-01");
    });

    it("should resolve 'day' period correctly", () => {
      const result = resolveTimeframe("day");

      expect(result.startDate).toBeDefined();
      expect(result.endDate).toBeDefined();

      const start = new Date(result.startDate);
      const end = new Date(result.endDate);
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

      expect(diffDays).toBeCloseTo(1, 0);
    });

    it("should resolve 'week' period correctly", () => {
      const result = resolveTimeframe("week");

      const start = new Date(result.startDate);
      const end = new Date(result.endDate);
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

      expect(diffDays).toBeCloseTo(7, 0);
    });

    it("should resolve 'month' period correctly", () => {
      const result = resolveTimeframe("month");

      const start = new Date(result.startDate);
      const end = new Date(result.endDate);
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

      expect(diffDays).toBeGreaterThanOrEqual(28);
      expect(diffDays).toBeLessThanOrEqual(31);
    });

    it("should resolve 'quarter' period correctly", () => {
      const result = resolveTimeframe("quarter");

      const start = new Date(result.startDate);
      const end = new Date(result.endDate);
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

      expect(diffDays).toBeGreaterThanOrEqual(89);
      expect(diffDays).toBeLessThanOrEqual(92);
    });

    it("should resolve numeric month patterns like '3m'", () => {
      const result = resolveTimeframe("3m");

      const start = new Date(result.startDate);
      const end = new Date(result.endDate);
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

      expect(diffDays).toBeGreaterThanOrEqual(89);
      expect(diffDays).toBeLessThanOrEqual(92);
    });

    it("should resolve specific month format YYYY-MM", () => {
      const result = resolveTimeframe("2024-03");

      expect(result.startDate).toBe("2024-03-01");
      expect(result.endDate).toBe("2024-04-01");
    });

    it("should default to 3 months when no parameters provided", () => {
      const result = resolveTimeframe();

      const start = new Date(result.startDate);
      const end = new Date(result.endDate);
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

      expect(diffDays).toBeGreaterThanOrEqual(89);
      expect(diffDays).toBeLessThanOrEqual(92);
    });

    it("should prioritize explicit timeframe over period", () => {
      const timeframe: Timeframe = {
        start_year: 2024,
        start_month: 1,
        end_year: 2024,
        end_month: 2,
      };

      const result = resolveTimeframe("year", timeframe);

      expect(result.startDate).toBe("2024-01-01");
      expect(result.endDate).toBe("2024-02-01");
    });
  });

  describe("periodToMilliseconds", () => {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    it("should convert 'day' to 1 day in ms", () => {
      expect(periodToMilliseconds("day")).toBe(MS_PER_DAY);
    });

    it("should convert 'week' to 7 days in ms", () => {
      expect(periodToMilliseconds("week")).toBe(7 * MS_PER_DAY);
    });

    it("should convert 'month' to 30 days in ms", () => {
      expect(periodToMilliseconds("month")).toBe(30 * MS_PER_DAY);
    });

    it("should convert 'quarter' to 90 days in ms", () => {
      expect(periodToMilliseconds("quarter")).toBe(90 * MS_PER_DAY);
    });

    it("should default to 7 days for unknown period", () => {
      expect(periodToMilliseconds("unknown")).toBe(7 * MS_PER_DAY);
      expect(periodToMilliseconds()).toBe(7 * MS_PER_DAY);
    });
  });
});

describe("No Data Handler", () => {
  describe("handleNoData", () => {
    it("should return structured JSON response", () => {
      const result = handleNoData("get_system_vitals", {});
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe("no_data");
      expect(parsed.toolName).toBe("get_system_vitals");
      expect(parsed.message).toContain("No data found");
      expect(Array.isArray(parsed.suggestions)).toBe(true);
    });

    it("should include input context in message", () => {
      const result = handleNoData("get_system_vitals", {
        node_filter: "node-1",
        period: "day",
      });
      const parsed = JSON.parse(result);

      expect(parsed.message).toContain('node "node-1"');
      expect(parsed.message).toContain('period "day"');
    });

    it("should include tool-specific suggestions", () => {
      const vitalsResult = JSON.parse(handleNoData("get_system_vitals", {}));
      expect(vitalsResult.suggestions).toContain("Check if the node hostname is correct");

      const fatalResult = JSON.parse(handleNoData("get_fatal_requests", {}));
      expect(fatalResult.suggestions).toContain("No failed queries may indicate healthy operation");
    });

    it("should always include common suggestions", () => {
      const result = JSON.parse(handleNoData("unknown_tool", {}));

      expect(result.suggestions).toContain("Try a broader time range");
      expect(result.suggestions).toContain("Verify the cluster is running and accessible");
    });

    it("should preserve original input in response", () => {
      const input = { scope_name: "test", collection_name: "users", limit: 10 };
      const result = JSON.parse(handleNoData("get_schema_for_collection", input));

      expect(result.input).toEqual(input);
    });
  });

  describe("formatToolResult", () => {
    it("should format successful result", () => {
      const result = formatToolResult("test_tool", true, { key: "value" }, 150);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.toolName).toBe("test_tool");
      expect(parsed.executionTimeMs).toBe(150);
      expect(parsed.data).toEqual({ key: "value" });
    });

    it("should format failed result", () => {
      const result = formatToolResult("test_tool", false, { error: "Something went wrong" }, 50);
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.data.error).toBe("Something went wrong");
    });

    it("should handle array data", () => {
      const data = [{ id: 1 }, { id: 2 }];
      const result = formatToolResult("test_tool", true, data, 200);
      const parsed = JSON.parse(result);

      expect(parsed.data).toHaveLength(2);
      expect(parsed.data[0].id).toBe(1);
    });

    it("should handle null data", () => {
      const result = formatToolResult("test_tool", true, null, 100);
      const parsed = JSON.parse(result);

      expect(parsed.data).toBeNull();
    });
  });
});
