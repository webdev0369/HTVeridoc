import Redis, { type RedisOptions } from 'ioredis';

export const QUEUE_ENABLED = 'QUEUE_ENABLED';
export const MIN_REDIS_MAJOR = 5;

export interface RedisCompatResult {
  ok: boolean;
  version: string | null;
  reason?: string;
}

/** BullMQ / ioredis connection from REDIS_URL (supports Upstash `rediss://`). */
export function redisConnectionFromUrl(redisUrl: string): RedisOptions {
  const url = new URL(redisUrl);
  const useTls = url.protocol === 'rediss:';
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    ...(useTls ? { tls: {} } : {}),
  };
}

let cached: RedisCompatResult | null = null;

export async function checkRedisBullMqCompat(
  redisUrl: string,
): Promise<RedisCompatResult> {
  if (cached) {
    return cached;
  }

  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    lazyConnect: true,
    enableOfflineQueue: false,
  });

  try {
    await redis.connect();
    const info = await redis.info('server');
    const match = /redis_version:([^\r\n]+)/i.exec(info);
    const version = match?.[1]?.trim() ?? null;
    if (!version) {
      cached = {
        ok: false,
        version: null,
        reason: 'Could not read redis_version',
      };
      return cached;
    }

    const major = Number(version.split('.')[0]);
    if (!Number.isFinite(major) || major < MIN_REDIS_MAJOR) {
      cached = {
        ok: false,
        version,
        reason: `BullMQ requires Redis >= ${MIN_REDIS_MAJOR}.0.0 (found ${version})`,
      };
      return cached;
    }

    cached = { ok: true, version };
    return cached;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Redis unreachable';
    cached = { ok: false, version: null, reason: message };
    return cached;
  } finally {
    try {
      redis.disconnect();
    } catch {
      /* ignore */
    }
  }
}
