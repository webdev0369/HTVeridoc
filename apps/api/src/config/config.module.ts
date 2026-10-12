import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { envSchema } from './env.schema';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      // Prefer apps/api/.env over repo-root .env (first file wins in Nest ConfigModule)
      envFilePath: ['.env', '../../.env'],
      validate: (config) => envSchema.parse(config),
    }),
  ],
})
export class AppConfigModule {}
