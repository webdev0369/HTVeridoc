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
      // App cwd .env first, then monorepo root from apps/api/<service>
      envFilePath: ['.env', '../../../.env', '../../.env'],
      validate: validateEnv,
    }),
  ],
})
export class AppConfigModule {}
