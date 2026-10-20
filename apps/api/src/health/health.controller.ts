import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import Redis from 'ioredis';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly config: ConfigService,
  ) {}

  @Get()
  live() {
    return {
      status: 'ok',
      service: 'htveridoc-api',
      slice: process.env.SERVICE_NAME || 'all',
    };
  }

  @Get('ready')
  @HealthCheck()
  async ready() {
    const result = await this.health.check([
      () => this.db.pingCheck('database'),
    ]);

    let redisStatus: 'up' | 'down' = 'down';
    const redisUrl = this.config.get<string>(
      'REDIS_URL',
      'redis://localhost:6379',
    );
    const redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 1500,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    try {
      await redis.connect();
      await redis.ping();
      redisStatus = 'up';
    } catch {
      redisStatus = 'down';
    } finally {
      try {
        redis.disconnect();
      } catch {
        /* ignore */
      }
    }

    return {
      ...result,
      info: {
        ...result.info,
        redis: { status: redisStatus, optional: true },
      },
    };
  }
}
