import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { resolveServiceName } from './service-name';

async function bootstrap() {
  const service = resolveServiceName();
  const app = await NestFactory.create(await AppModule.forRoot(), {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const config = app.get(ConfigService);
  const corsOrigin = config.get<string>('CORS_ORIGIN', 'http://localhost:3000');

  app.enableCors({
    origin: corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Railway / cloud injects PORT; local/dev uses API_PORT (default 3001).
  // Bind 0.0.0.0 so platform healthchecks can reach the process (not only localhost).
  const port =
    Number(process.env.PORT) ||
    config.get<number>('API_PORT', 3001);
  await app.listen(port, '0.0.0.0');
  Logger.log(
    `HTVeridoc API [${service}] listening on http://0.0.0.0:${port}`,
    'Bootstrap',
  );
}

bootstrap();
