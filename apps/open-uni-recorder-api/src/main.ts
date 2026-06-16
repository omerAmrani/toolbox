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
  await app.listen(port, '0.0.0.0');
  console.log(`\n🔧  Open University API`);
  console.log(`🌐  Listening on 0.0.0.0:${port}\n`);
}

bootstrap();
