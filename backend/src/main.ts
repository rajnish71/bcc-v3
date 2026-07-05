// backend/src/main.ts
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
  );
  // NOTE: setGlobalPrefix is intentionally NOT set here.
  // All controllers declare their own full path including 'api/v1/...'
  // Nginx proxies /api/v1/ -> http://127.0.0.1:3001/api/v1/ (path preserved)
  // so the controller-level prefix is the single source of truth.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  await app.listen(port, '127.0.0.1');
  console.log(`BCC V3 backend listening on 127.0.0.1:${port}`);
}
bootstrap();
