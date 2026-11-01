import { Controller, Delete, Get, HttpCode, HttpStatus, Module, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { DeletionScheduled } from '@edu-forum/shared';
import { CurrentUser } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';
import { clearRefreshCookie } from '../auth/auth.controller';
import { AuthModule } from '../auth/auth.module';
import { SeoModule } from '../seo/seo.module';
import { UploadsModule } from '../uploads/uploads.module';
import { AccountDeletionService } from './account-deletion.service';
import { AccountExportService } from './account-export.service';

@Controller('me')
export class AccountController {
  constructor(
    private readonly exporter: AccountExportService,
    private readonly deletion: AccountDeletionService,
  ) {}

  /** NDPA: hidden now, erased after 30 days (signing in cancels); signs out everywhere now. */
  @Delete()
  @HttpCode(HttpStatus.ACCEPTED)
  async requestDeletion(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response): Promise<DeletionScheduled> {
    const scheduledFor = await this.deletion.request(user.id);
    clearRefreshCookie(res);
    return { deletionScheduledFor: scheduledFor.toISOString() };
  }

  /** NDPA data portability: everything the account holds, as a JSON download. */
  @Get('export')
  async export(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    const data = await this.exporter.export(user.id);
    const day = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="edu-forum-my-data-${day}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    return data;
  }
}

/** Account data export and deletion (Phase 11). Listed after SearchModule in AppModule (route order). */
@Module({
  imports: [AuthModule, UploadsModule, SeoModule],
  controllers: [AccountController],
  providers: [AccountExportService, AccountDeletionService],
})
export class AccountModule {}
