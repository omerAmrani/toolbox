import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: process.env.WEB_ORIGIN || 'http://localhost:3000',
  });

  const port = process.env.API_PORT || 3001;
  await app.listen(port);
  console.log(`\n🔧  Open University API`);
  console.log(`🌐  http://localhost:${port}\n`);
}

bootstrap();
