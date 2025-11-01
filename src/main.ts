import { randomUUID } from 'crypto';
(global as any).crypto = { randomUUID };




import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';




async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3500);
  app.enableCors({
    origin: '*', // یا دامنه خاص مثلاً http://72.61.158.39
  });
  dotenv.config();
}
bootstrap();
