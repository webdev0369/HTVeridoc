import { Logger, ValidationPipe, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Shared Nest bootstrap for every HTVeriDoc microservice app. */
export async function createMicroserviceApp(opts: {
  appName: string;
  // Nest accepts Type, DynamicModule, or Promise thereof
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AppModule: any;
}) {
  const { appName } = opts;
  process.env.APP_NAME = appName;

  const moduleRef = await Promise.resolve(opts.AppModule);

  const app = await NestFactory.create(moduleRef as Type<unknown>, {
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

  const swagger = new DocumentBuilder()
    .setTitle(`HTVeriDoc API — ${appName}`)
    .setDescription(`Microservice: **${appName}**`)
    .setVersion('0.1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port =
    Number(process.env.PORT) || config.get<number>('API_PORT', 3001);
  await app.listen(port, '0.0.0.0');
  Logger.log(
    `HTVeridoc [${appName}] listening on http://0.0.0.0:${port}`,
    'Bootstrap',
  );
  Logger.log(
    `Swagger [${appName}] → http://0.0.0.0:${port}/docs`,
    'Bootstrap',
  );
}
