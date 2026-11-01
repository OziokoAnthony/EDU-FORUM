import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { validateEnv } from './config/env';
import { AuditModule } from './infra/audit/audit.service';
import { FilesModule } from './infra/files.module';
import { MessagingModule } from './infra/messaging.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RealtimeModule } from './infra/realtime/realtime.module';
import { AdminModule } from './modules/admin/admin.controller';
import { ApplicationsModule } from './modules/applications/applications.module';
import { AuthModule } from './modules/auth/auth.module';
import { CommunityModule } from './modules/community/community.module';
import { CvModule } from './modules/cv/cv.module';
import { DashboardsModule } from './modules/dashboards/dashboards.module';
import { HealthModule } from './modules/health/health.module';
import { InterviewsModule } from './modules/interviews/interviews.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { ConversationsModule } from './modules/messaging/messaging.module';
import { MetaModule } from './modules/meta/meta.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SavedModule } from './modules/saved/saved.module';
import { TeachersModule } from './modules/teachers/teachers.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { SearchModule } from './modules/search/search.module';
import { VacanciesModule } from './modules/vacancies/vacancies.module';
import { AccountModule } from './modules/users/account.module';
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
    AuditModule,
    RealtimeModule,
    NotificationsModule,
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
    ApplicationsModule,
    InvitationsModule,
    InterviewsModule,
    ConversationsModule,
    SavedModule,
    DashboardsModule,
    RemindersModule,
    AccountModule,
    CommunityModule,
    ReportsModule,
    AdminModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
