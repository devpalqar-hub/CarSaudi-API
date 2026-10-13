import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import helmet from 'helmet';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    rawBody: true, // Required for Stripe webhook signature verification
  });

  // Trust proxy for rate limiting (X-Forwarded-For)
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Security Headers
  app.use(helmet());

  // Body Parsing limits
  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  // ── WebSocket adapter ──────────────────────────────────────────────────────
  // REQUIRED: without this, Socket.IO connections will silently fail.
  // The IoAdapter bridges NestJS WebSocketGateway decorators to Socket.IO.
  app.useWebSocketAdapter(new IoAdapter(app));

  // Global prefix
  app.setGlobalPrefix('api');

  // CORS
  app.enableCors();

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true,
      transform: true, // auto-transform payloads to DTO classes
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ── Swagger setup ──────────────────────────────────────────────────────────
  // Note: We do NOT manually call .addTag() here.
  // SwaggerModule.createDocument() auto-discovers all @ApiTags() from controllers.
  // This means any new module with @ApiTags() will appear in Swagger automatically.
  const config = new DocumentBuilder()
    .setTitle('VillasQatar API')
    .setDescription(
      'REST API for VillasQatar — Property listing platform.\n\n' +
        '**User Roles**: `SUPER_ADMIN` | `MODERATOR` | `DEALER` | `DEALER_STAFF` | `USER`\n\n' +
        '**Authentication**: Use `POST /api/auth/login` to get a Bearer token, then click **Authorize** above and paste it.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter your JWT Bearer token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  if (process.env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('hidden/developer/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`🚀 HTTP server running on: http://localhost:${port}/api`);
  logger.log(`🔌 WebSocket available at:  ws://localhost:${port}/chat`);
  if (process.env.NODE_ENV !== 'production') {
    logger.log(`📚 Swagger docs:            http://localhost:${port}/hidden/developer/docs`);
  }
}
bootstrap();
