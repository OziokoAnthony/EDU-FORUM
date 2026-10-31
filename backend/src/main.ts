import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const config = app.get(ConfigService);
  app.enableCors({ origin: config.get<string>('APP_URL'), credentials: true });
  await app.listen(config.get<number>('API_PORT') ?? 4000);
}

void bootstrap();
