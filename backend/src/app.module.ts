import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { validateEnv } from './config/env';
import { FilesModule } from './infra/files.module';
import { MessagingModule } from './infra/messaging.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { CvModule } from './modules/cv/cv.module';
import { HealthModule } from './modules/health/health.module';
import { MetaModule } from './modules/meta/meta.module';
import { TeachersModule } from './modules/teachers/teachers.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { SearchModule } from './modules/search/search.module';
import { VacanciesModule } from './modules/vacancies/vacancies.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: config.getOrThrow<string>('JWT_ACCESS_SECRET') }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        { name: 'auth', ttl: 60_000, limit: config.getOrThrow<number>('AUTH_RATE_LIMIT') },
      ],
    }),
    PrismaModule,
    MessagingModule,
    FilesModule,
    HealthModule,
    AuthModule,
    UsersModule,
    MetaModule,
    UploadsModule,
    TeachersModule,
    CvModule,
    VacanciesModule,
    // After TeachersModule: /teachers/me must match before /teachers/:id.
    SearchModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
