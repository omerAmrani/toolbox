import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PORT, WEB_ORIGIN, IS_LOCAL_MODE } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  const webOrigins = [WEB_ORIGIN, WEB_ORIGIN.replace('127.0.0.1', 'localhost'), WEB_ORIGIN.replace('localhost', '127.0.0.1')];
  app.enableCors({
    origin: [...new Set(webOrigins)],
    allowedHeaders: ['Content-Type'],
    credentials: true,
  });

  app.use((req: any, res: any, next: () => void) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms ip=${req.ip}`);
    });
    next();
  });

  // Local mode has no login, so never expose it beyond this machine.
  const host = IS_LOCAL_MODE ? '127.0.0.1' : '0.0.0.0';
  await app.listen(PORT, host);
  console.log(`\n🔧  Open University API${IS_LOCAL_MODE ? ' (local mode)' : ''}`);
  console.log(`🌐  Listening on ${host}:${PORT}\n`);
}

bootstrap();
