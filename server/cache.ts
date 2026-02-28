// Edge-compatible — @upstash/redis uses fetch() internally, no TCP.
// When UPSTASH_REDIS_REST_URL is absent (local dev), all operations are no-ops.
import { Redis } from "@upstash/redis";

const redis = process.env.UPSTASH_REDIS_REST_URL
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

const TTL = 3600; // 1-hour safety TTL in case an invalidation is ever missed

export const cacheKeys = {
  years: "years",
  teams: (yearId: string) => `teams:${yearId}`,
  fishWeights: (yearId: string) => `fw:${yearId}`,
  chugTimes: (yearId: string) => `ct:${yearId}`,
  golfScores: (yearId: string) => `gs:${yearId}`,
};

export async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!redis) return fn();
  const hit = await redis.get<T>(key);
  if (hit !== null) return hit;
  const value = await fn();
  await redis.set(key, value, { ex: TTL });
  return value;
}

export async function invalidate(...keys: string[]): Promise<void> {
  if (!redis || keys.length === 0) return;
  await Promise.all(keys.map((k) => redis!.del(k)));
}
