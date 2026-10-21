import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ALL_ENTITIES,
  DocumentsCoreModule,
  ExtractionCoreModule,
  FieldConfigCoreModule,
  HandoffCoreModule,
  OrganizationsCoreModule,
  ReviewModule,
  ValidationModule,
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
    DocumentsCoreModule,
    ExtractionCoreModule,
    FieldConfigCoreModule,
    OrganizationsCoreModule,
    ValidationModule,
    HandoffCoreModule,
    ReviewModule,
  ],
})
export class AppModule {}
