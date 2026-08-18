import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PORT, WEB_ORIGIN } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.set('trust proxy', 1);
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

  const port = PORT;
  await app.listen(port, '0.0.0.0');
  console.log(`\n🔧  Open University API`);
  console.log(`🌐  Listening on 0.0.0.0:${port}\n`);
}

bootstrap();
