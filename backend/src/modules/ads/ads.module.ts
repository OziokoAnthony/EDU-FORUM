import { Body, Controller, Get, HttpStatus, Injectable, Module, Param, Put } from '@nestjs/common';
import { AD_SLOTS, adSettingSchema, findAdSlot, type AdminAdSlot, type AdsConfigResponse } from '@edu-forum/shared';
import type { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Public, Roles } from '../../common/auth/decorators';
import { ApiException } from '../../common/filters/api-exception.filter';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AdPageType } from '../../generated/prisma/client';
import { AuditService } from '../../infra/audit/audit.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SeoModule } from '../seo/seo.module';
import { SeoNotifier } from '../seo/seo-notifier';

/**
 * Ad spaces (CLAUDE.md AdSense rules; user 2026-11-01): every space starts off; an admin
 * switches each on with its AdSense slot ID. Public pages read GET /ads/config (cached, tag
 * `ads`, refreshed on every change) and render nothing for spaces that are off.
 */
@Injectable()
export class AdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly seo: SeoNotifier,
  ) {}

  async config(): Promise<AdsConfigResponse> {
    const rows = await this.prisma.adSettings.findMany({ where: { enabled: true, slotId: { not: null } } });
    return {
      slots: rows
        .filter((r) => findAdSlot(r.pageType, r.slotName))
        .map((r) => ({ pageType: r.pageType, slotName: r.slotName, slotId: r.slotId! })),
    };
  }

  async adminList(): Promise<AdminAdSlot[]> {
    const rows = await this.prisma.adSettings.findMany();
    return AD_SLOTS.map((def) => {
      const r = rows.find((x) => x.pageType === def.pageType && x.slotName === def.slotName);
      return { ...def, enabled: r?.enabled ?? false, slotId: r?.slotId ?? null, updatedAt: r?.updatedAt.toISOString() ?? null };
    });
  }

  async update(admin: AuthUser, pageType: string, slotName: string, input: z.output<typeof adSettingSchema>): Promise<AdminAdSlot> {
    const def = findAdSlot(pageType, slotName);
    if (!def) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Ad space not found');
    const key = { pageType: def.pageType as AdPageType, slotName: def.slotName };
    const row = await this.prisma.adSettings.upsert({
      where: { pageType_slotName: key },
      update: { enabled: input.enabled, slotId: input.slotId },
      create: { ...key, enabled: input.enabled, slotId: input.slotId },
    });
    await this.audit.log({ actorId: admin.id, action: 'ads.update', targetType: 'ad_slot', targetId: row.id, metadata: { pageType, slotName, enabled: input.enabled, slotId: input.slotId } });
    await this.seo.revalidate(['ads']);
    return { ...def, enabled: row.enabled, slotId: row.slotId, updatedAt: row.updatedAt.toISOString() };
  }
}

/** PRD `GET /ads/config` (public). */
@Controller('ads')
@Public()
export class AdsController {
  constructor(private readonly ads: AdsService) {}

  @Get('config')
  config() {
    return this.ads.config();
  }
}

/** Admin ad settings (audit-logged). */
@Controller('admin/ads')
@Roles('admin')
export class AdminAdsController {
  constructor(private readonly ads: AdsService) {}

  @Get()
  list() {
    return this.ads.adminList();
  }

  @Put(':pageType/:slotName')
  update(
    @CurrentUser() me: AuthUser,
    @Param('pageType') pageType: string,
    @Param('slotName') slotName: string,
    @Body(new ZodValidationPipe(adSettingSchema)) body: z.output<typeof adSettingSchema>,
  ) {
    return this.ads.update(me, pageType, slotName, body);
  }
}

@Module({
  imports: [SeoModule],
  controllers: [AdsController, AdminAdsController],
  providers: [AdsService],
})
export class AdsModule {}
