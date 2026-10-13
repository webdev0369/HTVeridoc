import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ZodError } from 'zod';
import { envSchema } from './env.schema';

function validateEnv(config: Record<string, unknown>) {
  try {
    return envSchema.parse(config);
  } catch (err) {
    if (err instanceof ZodError) {
      const details = err.issues
        .map((issue) => {
          const path = issue.path.join('.') || '(root)';
          return `${path}: ${issue.message} (expected ${'expected' in issue ? String(issue.expected) : 'valid value'}, got ${'received' in issue ? String(issue.received) : 'invalid'})`;
        })
        .join('; ');
      throw new Error(
        `Invalid environment variables — set these on the API service: ${details}`,
      );
    }
    throw err;
  }
}

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      // Prefer apps/api/.env over repo-root .env (first file wins in Nest ConfigModule)
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
  ],
})
export class AppConfigModule {}
