import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ALL_ENTITIES,
  DocumentQueuesModule,
  DocumentsModule,
  FieldConfigModule,
  HandoffCoreModule,
} from '@htveridoc/domains';
import { AppConfigModule, HealthModule, StorageModule, JwtAuthModule } from '@htveridoc/shared';

@Module({
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
    DocumentQueuesModule,
    FieldConfigModule,
    HandoffCoreModule,
    DocumentsModule,
  ],
})
export class AppModule {}
