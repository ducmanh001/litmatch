import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { DomainException } from '@litmatch/common-exceptions';

import { CallingErrors } from '../calling.errors';
import { CallingService } from '../calling.service';
import { LivekitRoomPort } from '../ports/livekit-room';
import { Public } from '../../../common/decorators/public.decorator';

import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Webhook LiveKit (spec § 3) — pattern verify-rồi-mới-tin của economy webhooks:
 * `@Public` (LiveKit không có JWT user) nhưng chữ ký JWT ký bằng API key/secret được verify
 * trên NGUYÊN VĂN body (main.ts bật rawBody) TRƯỚC khi đọc nội dung. Sai chữ ký → 401.
 * Xử lý idempotent (service) → LiveKit retry an toàn, luôn trả 200 khi đã verify.
 */
@ApiExcludeController()
@Controller('calling/webhooks')
export class LivekitWebhookController {
  constructor(
    private readonly callingService: CallingService,
    private readonly livekit: LivekitRoomPort,
  ) {}

  @Public()
  @Post('livekit')
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('authorization') authHeader?: string,
  ): Promise<{ ok: true }> {
    const rawBody = req.rawBody?.toString('utf8');
    if (!rawBody || !authHeader) {
      throw new DomainException(
        CallingErrors.WEBHOOK_INVALID,
        'Thiếu body hoặc Authorization header',
        HttpStatus.UNAUTHORIZED,
      );
    }
    let event;
    try {
      event = await this.livekit.receiveWebhook(rawBody, authHeader);
    } catch {
      throw new DomainException(
        CallingErrors.WEBHOOK_INVALID,
        'Chữ ký webhook không hợp lệ',
        HttpStatus.UNAUTHORIZED,
      );
    }
    await this.callingService.handleWebhookEvent(event);
    return { ok: true };
  }
}
