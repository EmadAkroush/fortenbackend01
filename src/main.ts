import { randomUUID } from 'crypto';
(global as any).crypto = { randomUUID };

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3500);
  app.enableCors({
    origin: '*', // 🔓 همه دامنه‌ها مجاز
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'], // یا دامنه خاص مثلاً http://72.61.158.39
    credentials: true,
  });
  dotenv.config();
}
bootstrap();
