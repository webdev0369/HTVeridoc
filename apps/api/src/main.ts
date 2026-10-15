import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
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
  const port =
    Number(process.env.PORT) ||
    config.get<number>('API_PORT', 3001);
  await app.listen(port);
  Logger.log(`HTVeridoc API listening on http://localhost:${port}`, 'Bootstrap');
}

bootstrap();
