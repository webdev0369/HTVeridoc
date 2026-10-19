import { DynamicModule, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { QueueAdminController } from './queue-admin.controller';
import { QueueAdminService } from './queue-admin.service';
import {
  QUEUE_ENABLED,
  checkRedisBullMqCompat,
  redisConnectionFromUrl,
} from './redis-compat';

@Module({})
export class QueueModule {
  private static readonly logger = new Logger(QueueModule.name);

  static async forRootAsync(): Promise<DynamicModule> {
    // Config may not be ready yet; read process env / dotenv already loaded by Nest later.
    // A light dotenv load keeps this check accurate during bootstrap.
    const redisUrl =
      process.env.REDIS_URL || 'redis://localhost:6379';
    const compat = await checkRedisBullMqCompat(redisUrl);

    if (!compat.ok) {
      this.logger.warn(
        `BullMQ disabled: ${compat.reason ?? 'Redis incompatible'}. Extraction will run inline.`,
      );
      return {
        module: QueueModule,
        global: true,
        controllers: [QueueAdminController],
        providers: [
          { provide: QUEUE_ENABLED, useValue: false },
          QueueAdminService,
        ],
        exports: [QUEUE_ENABLED],
      };
    }

    this.logger.log(`BullMQ enabled (Redis ${compat.version})`);
    return {
      module: QueueModule,
      global: true,
      imports: [
        BullModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => {
            const base = redisConnectionFromUrl(
              config.get<string>('REDIS_URL', 'redis://localhost:6379'),
            );
            return {
              connection: {
                ...base,
                maxRetriesPerRequest: null,
                enableOfflineQueue: true,
                lazyConnect: true,
                retryStrategy: (times: number) =>
                  Math.min(times * 500, 5000),
              },
            };
          },
        }),
      ],
      controllers: [QueueAdminController],
      providers: [
        { provide: QUEUE_ENABLED, useValue: true },
        QueueAdminService,
      ],
      exports: [QUEUE_ENABLED, BullModule],
    };
  }
}
