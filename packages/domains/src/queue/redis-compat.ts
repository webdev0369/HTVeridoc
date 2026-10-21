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

  const trimmed = redisUrl?.trim() ?? '';
  if (!trimmed) {
    cached = {
      ok: false,
      version: null,
      reason: 'REDIS_URL is empty',
    };
    return cached;
  }

  try {
    // Validate early so a bad Upstash paste does not crash Nest bootstrap.
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
      cached = {
        ok: false,
        version: null,
        reason: `REDIS_URL must start with redis:// or rediss:// (got ${parsed.protocol})`,
      };
      return cached;
    }
  } catch {
    cached = {
      ok: false,
      version: null,
      reason:
        'REDIS_URL is not a valid URL. Use Upstash Redis URL, e.g. rediss://default:TOKEN@HOST:6379',
    };
    return cached;
  }

  let redis: Redis | null = null;
  try {
    redis = new Redis(trimmed, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
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
      redis?.disconnect();
    } catch {
      /* ignore */
    }
  }
}
