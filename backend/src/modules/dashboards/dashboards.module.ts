import { Controller, Get, Module, Query } from '@nestjs/common';
import { profileViewsQuerySchema, type HiringDashboard, type TeacherDashboard } from '@edu-forum/shared';
import type { z } from 'zod';
import { CurrentUser, RequireVerified, Roles } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SearchModule } from '../search/search.module';
import { TeachersModule } from '../teachers/teachers.module';
import { DashboardsService } from './dashboards.service';

@Controller('teachers/me')
@Roles('teacher')
@RequireVerified()
export class TeacherDashboardController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser): Promise<TeacherDashboard> {
    return this.dashboards.teacher(user);
  }

  @Get('profile-views')
  profileViews(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(profileViewsQuerySchema)) q: z.output<typeof profileViewsQuerySchema>) {
    return this.dashboards.profileViews(user, q);
  }
}

/** The PRD's /schools/me/dashboard, for principals and directors (no school accounts). */
@Controller('hiring')
@Roles('leader')
@RequireVerified()
export class HiringDashboardController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthUser): Promise<HiringDashboard> {
    return this.dashboards.hiring(user);
  }
}

@Module({
  imports: [TeachersModule, SearchModule],
  controllers: [TeacherDashboardController, HiringDashboardController],
  providers: [DashboardsService],
})
export class DashboardsModule {}
