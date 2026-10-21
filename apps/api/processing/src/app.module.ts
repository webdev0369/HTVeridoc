import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ALL_ENTITIES,
  AiModule,
  DocumentsCoreModule,
  ExtractionModule,
  HandoffCoreModule,
  ProcessingModule,
  QueueModule,
} from '@htveridoc/domains';
import { AppConfigModule, HealthModule, StorageModule, JwtAuthModule } from '@htveridoc/shared';

@Module({})
export class AppModule {
  static async forRoot(): Promise<DynamicModule> {
    return {
      module: AppModule,
      imports: [
        AppConfigModule,
        TypeOrmModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            type: 'postgres' as const,
            url: config.getOrThrow<string>('DATABASE_URL'),
            entities: ALL_ENTITIES,
            synchronize: false,
            logging: config.get('NODE_ENV') === 'development',
          }),
        }),
        StorageModule,
        HealthModule,
        JwtAuthModule,
        QueueModule.forRootAsync(),
        AiModule,
        ExtractionModule,
        DocumentsCoreModule,
        HandoffCoreModule,
        ProcessingModule.forRootAsync(),
      ],
    };
  }
}
