import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { ADMIN_UPLOAD_PURPOSES, scanResultSchema, signUploadSchema, type SignUploadResponse } from '@edu-forum/shared';
import type { z } from 'zod';
import { CurrentUser, Public, RequireVerified } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth-user';
import { ApiException } from '../../common/filters/api-exception.filter';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { UploadsService } from './uploads.service';

@Controller('uploads')
@RequireVerified()
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /** Signed URL for a direct-to-storage upload (PRD: POST /uploads/sign, any role). */
  @Post('sign')
  sign(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(signUploadSchema)) body: z.output<typeof signUploadSchema>,
  ): Promise<SignUploadResponse> {
    // Resources (teaching materials, exam timetables) are uploaded by admins only.
    if (ADMIN_UPLOAD_PURPOSES.includes(body.purpose) && user.role !== 'admin') {
      throw new ApiException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Only admins can upload this');
    }
    return this.uploads.sign(user.id, body);
  }
}

/** PRD: POST /webhooks/storage/scan-result (Internal). Off unless SCAN_WEBHOOK_SECRET is set. */
@Controller('webhooks/storage')
@Public()
export class StorageWebhooksController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly config: ConfigService,
  ) {}

  @Post('scan-result')
  @HttpCode(HttpStatus.NO_CONTENT)
  async scanResult(
    @Headers('x-webhook-secret') secret: string | undefined,
    @Body(new ZodValidationPipe(scanResultSchema)) body: z.output<typeof scanResultSchema>,
  ): Promise<void> {
    const expected = this.config.get<string>('SCAN_WEBHOOK_SECRET') ?? '';
    if (!expected) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not found');
    const given = Buffer.from(secret ?? '');
    const want = Buffer.from(expected);
    if (given.length !== want.length || !timingSafeEqual(given, want)) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Invalid webhook secret');
    }
    await this.uploads.applyWebhookResult(body.uploadId, body.status);
  }
}
