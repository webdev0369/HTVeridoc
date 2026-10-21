import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ALL_ENTITIES,
  AuthModule,
  FieldConfigCoreModule,
  OrganizationsModule,
  UsersModule,
} from '@htveridoc/domains';
import { AppConfigModule, HealthModule, StorageModule } from '@htveridoc/shared';

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
    AuthModule,
    OrganizationsModule,
    UsersModule,
    FieldConfigCoreModule,
  ],
})
export class AppModule {}
