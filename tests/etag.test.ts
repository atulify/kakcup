import { describe, it, expect } from 'vitest';
import { fnv1a } from '../server/data-routes.js';

describe('fnv1a', () => {
  it('should return a hex string', () => {
    const result = fnv1a('hello');
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('should be deterministic', () => {
    expect(fnv1a('test data')).toBe(fnv1a('test data'));
  });

  it('should produce different hashes for different inputs', () => {
    expect(fnv1a('foo')).not.toBe(fnv1a('bar'));
    expect(fnv1a('[]')).not.toBe(fnv1a('[1]'));
  });

  it('should handle empty string', () => {
    const result = fnv1a('');
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('should handle large JSON-like strings', () => {
    const large = JSON.stringify(Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `item-${i}` })));
    const result = fnv1a(large);
    expect(result).toMatch(/^[0-9a-f]+$/);
    expect(fnv1a(large)).toBe(result);
  });
});
