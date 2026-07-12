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

import { PartyRoomErrors } from '../party-room.errors';
import { PartyRoomService } from '../party-room.service';
import { PartyLivekitRoomPort } from '../ports/livekit-party-room';
import { Public } from '../../../common/decorators/public.decorator';

import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Webhook LiveKit cho party (spec § 5) — cùng pattern verify-rồi-mới-tin của calling:
 * `@Public` nhưng chữ ký JWT (API key/secret) verify trên NGUYÊN VĂN body trước khi đọc.
 * LiveKit cấu hình 2 webhook URL (calling + party) — mỗi controller tự lọc theo prefix
 * room (`call-*` / `party-*`), event không thuộc mình thì bỏ qua sau khi verify.
 */
@ApiExcludeController()
@Controller('party/webhooks')
export class PartyLivekitWebhookController {
  constructor(
    private readonly partyRoomService: PartyRoomService,
    private readonly livekit: PartyLivekitRoomPort,
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
        PartyRoomErrors.WEBHOOK_INVALID,
        'Thiếu body hoặc Authorization header',
        HttpStatus.UNAUTHORIZED,
      );
    }
    let event;
    try {
      event = await this.livekit.receiveWebhook(rawBody, authHeader);
    } catch {
      throw new DomainException(
        PartyRoomErrors.WEBHOOK_INVALID,
        'Chữ ký webhook không hợp lệ',
        HttpStatus.UNAUTHORIZED,
      );
    }
    await this.partyRoomService.handleWebhookEvent(event);
    return { ok: true };
  }
}
