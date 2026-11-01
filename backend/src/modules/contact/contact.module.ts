import { Body, Controller, Get, HttpCode, HttpStatus, Injectable, Module, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  adminContactQuerySchema,
  APP_NAME,
  CONTACT_HOURLY_LIMIT,
  CONTACT_TOPIC_LABELS,
  contactSchema,
  type AdminContactMessage,
  type ContactTopic,
  type Paginated,
} from '@edu-forum/shared';
import type { Request } from 'express';
import { createHash } from 'node:crypto';
import type { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Public, Roles } from '../../common/auth/decorators';
import { ApiException } from '../../common/filters/api-exception.filter';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditService } from '../../infra/audit/audit.service';
import { EmailQueue } from '../../infra/mail/email-queue';
import { simpleEmail } from '../../infra/mail/simple-email';
import { PrismaService } from '../../infra/prisma/prisma.service';

const HOUR_MS = 3_600_000;
const tooMany = () => new ApiException(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', 'You have sent several messages already. Please wait an hour and try again.');

/** Contact form (user, 2026-11-01): kept for admins, emailed to SUPPORT_EMAIL; links and repeats refused. */
@Injectable()
export class ContactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailQueue,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async send(user: AuthUser | undefined, ip: string, input: z.output<typeof contactSchema>): Promise<{ received: true }> {
    const ipHash = createHash('sha256').update(ip).digest('hex');
    const since = new Date(Date.now() - HOUR_MS);
    const email = input.email.toLowerCase();
    const [byEmail, byIp] = await Promise.all([
      this.prisma.contactMessage.count({ where: { email, createdAt: { gte: since } } }),
      this.prisma.contactMessage.count({ where: { ipHash, createdAt: { gte: since } } }),
    ]);
    const limit = this.config.get<number>('CONTACT_RATE_LIMIT') ?? CONTACT_HOURLY_LIMIT;
    if (byEmail >= limit || byIp >= limit) throw tooMany();
    // The same message again within a day: accept quietly, keep one copy.
    const repeat = await this.prisma.contactMessage.findFirst({ where: { email, message: input.message, createdAt: { gte: new Date(Date.now() - 24 * HOUR_MS) } } });
    if (repeat) return { received: true };

    await this.prisma.contactMessage.create({
      data: { name: input.name, email, topic: input.topic, message: input.message, userId: user?.id ?? null, ipHash },
    });
    const to = this.config.get<string>('SUPPORT_EMAIL');
    if (to) {
      await this.emails.send(
        simpleEmail(to, `[${APP_NAME} contact] ${CONTACT_TOPIC_LABELS[input.topic]} from ${input.name}`, [`From: ${input.name} <${email}>`, `Topic: ${CONTACT_TOPIC_LABELS[input.topic]}`, input.message], {
          url: `${this.config.getOrThrow<string>('APP_URL')}/admin/messages`,
          text: 'Open in admin',
        }),
      );
    }
    return { received: true };
  }

  async list(q: z.output<typeof adminContactQuerySchema>): Promise<Paginated<AdminContactMessage>> {
    const where = { status: q.status };
    const [rows, total] = await Promise.all([
      this.prisma.contactMessage.findMany({ where, include: { user: { select: { role: true } } }, orderBy: { createdAt: q.status === 'open' ? 'asc' : 'desc' }, skip: (q.page - 1) * q.limit, take: q.limit }),
      this.prisma.contactMessage.count({ where }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        topic: r.topic as ContactTopic,
        message: r.message,
        status: r.status as 'open' | 'closed',
        userRole: r.user?.role ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: { page: q.page, limit: q.limit, total },
    };
  }

  async close(admin: AuthUser, id: string): Promise<{ id: string; status: 'closed' }> {
    const r = await this.prisma.contactMessage.findUnique({ where: { id } });
    if (!r) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Message not found');
    await this.prisma.contactMessage.update({ where: { id }, data: { status: 'closed', closedAt: new Date() } });
    await this.audit.log({ actorId: admin.id, action: 'contact.close', targetType: 'contact_message', targetId: id });
    return { id, status: 'closed' };
  }
}

@Controller('contact')
@Public()
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  send(@CurrentUser() user: AuthUser | undefined, @Req() req: Request, @Body(new ZodValidationPipe(contactSchema)) body: z.output<typeof contactSchema>) {
    return this.contact.send(user, req.ip ?? 'unknown', body);
  }
}

@Controller('admin/contact-messages')
@Roles('admin')
export class AdminContactController {
  constructor(private readonly contact: ContactService) {}

  @Get()
  list(@Query(new ZodValidationPipe(adminContactQuerySchema)) q: z.output<typeof adminContactQuerySchema>) {
    return this.contact.list(q);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  close(@CurrentUser() me: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.contact.close(me, id);
  }
}

@Module({
  controllers: [ContactController, AdminContactController],
  providers: [ContactService],
})
export class ContactModule {}
