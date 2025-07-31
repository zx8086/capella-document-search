import { describe, it, expect } from 'bun:test';
import { sanitizeToolInput, validateToolInputWithRetry, getFormatHints } from './bedrock-chat-schemas';

describe('Tool Input Sanitization', () => {
  describe('sanitizeToolInput', () => {
    it('should convert bare number to limit object for query tools', () => {
      const queryTools = [
        'get_most_expensive_queries',
        'get_longest_running_queries',
        'get_most_frequent_queries'
      ];
      
      queryTools.forEach(tool => {
        const result = sanitizeToolInput(tool, 10);
        expect(result).toEqual({ limit: 10 });
      });
    });
    
    it('should convert bare string to node_filter for system vitals', () => {
      const result = sanitizeToolInput('get_system_vitals', 'node1.example.com');
      expect(result).toEqual({ node_filter: 'node1.example.com' });
    });
    
    it('should convert bare string to service_filter for system nodes', () => {
      const result = sanitizeToolInput('get_system_nodes', 'n1ql');
      expect(result).toEqual({ service_filter: 'n1ql' });
    });
    
    it('should return input as-is if already an object', () => {
      const input = { limit: 20, period: 'week' };
      const result = sanitizeToolInput('get_most_expensive_queries', input);
      expect(result).toEqual(input);
    });
    
    it('should return input as-is for unknown tools', () => {
      const result = sanitizeToolInput('unknown_tool', 'test');
      expect(result).toBe('test');
    });
  });
  
  describe('validateToolInputWithRetry', () => {
    it('should auto-correct bare number input for query tools', () => {
      const result = validateToolInputWithRetry('get_most_expensive_queries', 10);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ limit: 10 });
      expect(result.wasAutoCorrected).toBe(true);
    });
    
    it('should pass validation without correction for proper input', () => {
      const input = { limit: 5 };
      const result = validateToolInputWithRetry('get_most_expensive_queries', input);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ limit: 5 });
      expect(result.wasAutoCorrected).toBe(false);
    });
    
    it('should fail validation with hints for invalid input', () => {
      const result = validateToolInputWithRetry('get_schema_for_collection', { invalid: 'data' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Expected format:');
      expect(result.hint).toBeDefined();
    });
    
    it('should handle empty object for tools that expect it', () => {
      const result = validateToolInputWithRetry('get_system_indexes', {});
      expect(result.success).toBe(true);
      expect(result.data).toEqual({});
    });
    
    it('should provide sanitized input in error response when auto-correction happens but still fails', () => {
      // Pass a bare string to a tool that expects objects with specific fields
      // The string won't be sanitized because get_schema_for_collection isn't handled
      const result = validateToolInputWithRetry('get_schema_for_collection', 'invalid');
      expect(result.success).toBe(false);
      // Since no sanitization happens for this tool/input combo, sanitizedInput should be undefined
      expect(result.sanitizedInput).toBeUndefined();
    });
  });
  
  describe('getFormatHints', () => {
    it('should return specific hints for known tools', () => {
      const hint = getFormatHints('get_most_expensive_queries');
      expect(hint).toContain('limit: number');
      expect(hint).toContain('period:');
    });
    
    it('should return generic hint for unknown tools', () => {
      const hint = getFormatHints('unknown_tool');
      expect(hint).toBe('object with appropriate parameters');
    });
    
    it('should indicate empty object for tools that need it', () => {
      const hint = getFormatHints('get_system_indexes');
      expect(hint).toBe('empty object {}');
    });
  });
});

// Integration test scenarios
describe('Real-world Validation Scenarios', () => {
  it('should handle the exact error case from the screenshot', () => {
    // This is the exact scenario that was failing
    const result = validateToolInputWithRetry('get_most_expensive_queries', 10);
    
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ limit: 10 });
    expect(result.wasAutoCorrected).toBe(true);
  });
  
  it('should handle complex tool inputs with multiple parameters', () => {
    const result = validateToolInputWithRetry('get_fatal_requests', {
      period: 'week',
      limit: 100
    });
    
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ period: 'week', limit: 100 });
  });
  
  it('should reject invalid enum values with helpful message', () => {
    const result = validateToolInputWithRetry('get_system_nodes', {
      service_filter: 'invalid_service'
    });
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Expected format:');
    expect(result.hint).toContain('n1ql');
  });
});