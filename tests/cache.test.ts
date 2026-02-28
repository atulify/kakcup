import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Static imports → UPSTASH_REDIS_REST_URL is absent in test env → redis = null
import { cached, invalidate, cacheKeys } from '../server/cache.js';

describe('cacheKeys', () => {
  it('produces stable string keys', () => {
    expect(cacheKeys.years).toBe('years');
    expect(cacheKeys.teams('abc')).toBe('teams:abc');
    expect(cacheKeys.fishWeights('xyz')).toBe('fw:xyz');
    expect(cacheKeys.chugTimes('xyz')).toBe('ct:xyz');
    expect(cacheKeys.golfScores('xyz')).toBe('gs:xyz');
  });
});

describe('cached() — no Redis (test / local dev environment)', () => {
  it('calls fn() and returns its result', async () => {
    const fn = vi.fn().mockResolvedValue([1, 2, 3]);
    const result = await cached('k', fn);
    expect(result).toEqual([1, 2, 3]);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('calls fn() on every invocation — no memoization without Redis', async () => {
    const fn = vi.fn().mockResolvedValue('data');
    await cached('k', fn);
    await cached('k', fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('invalidate() — no Redis', () => {
  it('resolves without error with keys', async () => {
    await expect(invalidate('key1', 'key2')).resolves.toBeUndefined();
  });

  it('resolves without error with no keys', async () => {
    await expect(invalidate()).resolves.toBeUndefined();
  });
});

describe('cached() + invalidate() — with mocked Redis', () => {
  let mockStore: Map<string, unknown>;

  beforeEach(() => {
    mockStore = new Map();
    vi.resetModules();
    vi.doMock('@upstash/redis', () => ({
      Redis: vi.fn().mockImplementation(() => ({
        get: vi.fn((key: string) => Promise.resolve(mockStore.get(key) ?? null)),
        set: vi.fn((key: string, value: unknown) => {
          mockStore.set(key, value);
          return Promise.resolve('OK');
        }),
        del: vi.fn((key: string) => {
          mockStore.delete(key);
          return Promise.resolve(1);
        }),
      })),
    }));
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://fake.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'fake-token');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('@upstash/redis');
  });

  it('serves cached value on second call — fn() called only once', async () => {
    const { cached } = await import('../server/cache.js');
    const fn = vi.fn().mockResolvedValue(['item1', 'item2']);

    const r1 = await cached('test-key', fn);
    const r2 = await cached('test-key', fn);

    expect(r1).toEqual(['item1', 'item2']);
    expect(r2).toEqual(['item1', 'item2']);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('different keys are cached independently', async () => {
    const { cached } = await import('../server/cache.js');
    const fn1 = vi.fn().mockResolvedValue('a');
    const fn2 = vi.fn().mockResolvedValue('b');

    const r1 = await cached('key-a', fn1);
    const r2 = await cached('key-b', fn2);

    expect(r1).toBe('a');
    expect(r2).toBe('b');
    expect(fn1).toHaveBeenCalledOnce();
    expect(fn2).toHaveBeenCalledOnce();
  });

  it('invalidate() clears the key so fn() is called again — write-through invariant', async () => {
    const { cached, invalidate } = await import('../server/cache.js');

    let n = 0;
    const fn = vi.fn().mockImplementation(() => Promise.resolve({ n: ++n }));

    const r1 = await cached('inv-key', fn);
    expect(r1).toEqual({ n: 1 });
    expect(fn).toHaveBeenCalledOnce();

    await invalidate('inv-key');

    const r2 = await cached('inv-key', fn);
    expect(r2).toEqual({ n: 2 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('invalidate() does not clear unrelated keys', async () => {
    const { cached, invalidate } = await import('../server/cache.js');
    const fn = vi.fn().mockResolvedValue('v');

    await cached('keep', fn);
    await cached('drop', fn);
    expect(fn).toHaveBeenCalledTimes(2);

    await invalidate('drop');

    await cached('keep', fn); // still cached → fn not called
    await cached('drop', fn); // invalidated → fn called again
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('invalidate() with no keys is a no-op', async () => {
    const { invalidate } = await import('../server/cache.js');
    await expect(invalidate()).resolves.toBeUndefined();
  });
});
