import { Body, Controller, Delete, Get, Global, HttpCode, HttpStatus, Inject, Injectable, Logger, Module, Post, Req, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { pushSubscriptionSchema, pushUnsubscribeSchema, type PushPayload, type PushPublicKeyResponse } from '@edu-forum/shared';
import type { Request } from 'express';
import webpush from 'web-push';
import type { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Public, RequireVerified, Roles } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { JOB_QUEUE, type JobQueue } from '../../infra/queue/job-queue';

export const SEND_PUSH_JOB = 'send-push';

/**
 * Push alerts (PWA, user 2026-11-01): every in-app notification is also pushed to each device
 * the user allowed (a browser or the installed app), even when the app is closed. Sent from a
 * background job; devices that have gone away (404/410) are forgotten. PUSH_DRIVER=off until
 * VAPID keys exist; "memory" records what would be sent (tests).
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger('PushService');
  /** PUSH_DRIVER=memory: what would have been sent. */
  readonly sent: { userId: string; endpoint: string; payload: PushPayload }[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(JOB_QUEUE) private readonly queue: JobQueue,
  ) {}

  private get driver(): 'webpush' | 'memory' | 'off' {
    const d = this.config.get<'webpush' | 'memory' | 'off'>('PUSH_DRIVER') ?? 'off';
    if (d === 'webpush' && (!this.config.get('VAPID_PUBLIC_KEY') || !this.config.get('VAPID_PRIVATE_KEY'))) return 'off';
    return d;
  }

  onModuleInit(): void {
    if (this.driver === 'webpush') {
      webpush.setVapidDetails(this.config.getOrThrow<string>('VAPID_SUBJECT'), this.config.getOrThrow<string>('VAPID_PUBLIC_KEY'), this.config.getOrThrow<string>('VAPID_PRIVATE_KEY'));
    }
    this.queue.register(SEND_PUSH_JOB, (data) => this.deliver(String(data.userId), data.payload as unknown as PushPayload));
  }

  publicKey(): PushPublicKeyResponse {
    return { publicKey: this.driver === 'off' ? null : this.config.get<string>('VAPID_PUBLIC_KEY') || null };
  }

  /** One row per device; a device that signs in as someone else moves to that account. */
  async subscribe(user: AuthUser, input: z.output<typeof pushSubscriptionSchema>, userAgent: string | undefined): Promise<void> {
    const data = { userId: user.id, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent: userAgent?.slice(0, 300) ?? null };
    await this.prisma.pushSubscription.upsert({ where: { endpoint: input.endpoint }, update: data, create: { ...data, endpoint: input.endpoint } });
  }

  async unsubscribe(user: AuthUser, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (this.driver === 'off') return;
    if (!(await this.prisma.pushSubscription.count({ where: { userId } }))) return;
    await this.queue.add(SEND_PUSH_JOB, { userId, payload: { ...payload } });
  }

  private async deliver(userId: string, payload: PushPayload): Promise<void> {
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    for (const s of subs) {
      if (this.driver === 'memory') {
        this.sent.push({ userId, endpoint: s.endpoint, payload });
        continue;
      }
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 24 * 3600, urgency: 'normal' });
        await this.prisma.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date() } });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
        else this.logger.warn(`Push to a device failed (${status ?? 'network'}): ${(err as Error).message}`);
      }
    }
  }
}

@Controller()
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('push/public-key')
  @Public()
  publicKey() {
    return this.push.publicKey();
  }

  @Post('me/push-subscriptions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('teacher', 'leader')
  @RequireVerified()
  subscribe(@CurrentUser() user: AuthUser, @Req() req: Request, @Body(new ZodValidationPipe(pushSubscriptionSchema)) body: z.output<typeof pushSubscriptionSchema>) {
    return this.push.subscribe(user, body, req.headers['user-agent']);
  }

  @Delete('me/push-subscriptions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('teacher', 'leader')
  unsubscribe(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(pushUnsubscribeSchema)) body: z.output<typeof pushUnsubscribeSchema>) {
    return this.push.unsubscribe(user, body.endpoint);
  }
}

@Global()
@Module({ controllers: [PushController], providers: [PushService], exports: [PushService] })
export class PushModule {}
