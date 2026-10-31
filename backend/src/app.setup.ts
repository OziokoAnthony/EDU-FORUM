import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { API_PREFIX } from '@edu-forum/shared';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';

/** Shared by main.ts and e2e tests so both run the same app configuration. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.use(cookieParser());
  app.useGlobalFilters(new ApiExceptionFilter());
}
