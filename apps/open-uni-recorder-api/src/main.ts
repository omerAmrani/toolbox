import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { API_PORT, WEB_ORIGIN } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: WEB_ORIGIN,
  });

  const port = API_PORT;
  await app.listen(port);
  console.log(`\n🔧  Open University API`);
  console.log(`🌐  http://localhost:${port}\n`);
}

bootstrap();
