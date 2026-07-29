import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PORT, WEB_ORIGIN } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: WEB_ORIGIN,
  });

  const port = PORT;
  await app.listen(port, '127.0.0.1');
  console.log(`\n🔧  Open University API`);
  console.log(`🌐  Listening on 127.0.0.1:${port}\n`);
}

bootstrap();
