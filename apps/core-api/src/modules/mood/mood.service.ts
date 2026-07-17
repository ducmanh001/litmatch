import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { Repository } from 'typeorm';

import {
  moodClearIdempotencyKey,
  moodSetIdempotencyKey,
} from './mood.constants';
import { MoodErrors } from './mood.errors';
import { MoodPreset } from './entities/mood-preset.entity';
import {
  MoodEventKind,
  MoodStatusEvent,
} from './entities/mood-status-event.entity';
import { isUniqueViolation } from '../../database/postgres-errors';
import { SafetyService } from '../safety';

import type { CoreApiEnv } from '../../config/env.validation';

export interface CurrentMood {
  preset: MoodPreset;
  setAt: Date;
  expiresAt: Date;
}

/**
 * Facade Mood (docs/services/mood-service.md): preset-only W1 — không có free-text/moderation
 * (backlog, xem docs/plans/2026-07-14-plan-6-tinh-nang-social-discovery.md § 3.5). Set/clear
 * append-only, "mood hiện tại" derive khi đọc từ dòng mới nhất; hiển thị public qua composition
 * `getPublicMood`, KHÔNG sửa `PublicProfileDto` dùng chung ở Soul Match/Friend.
 */
@Injectable()
export class MoodService {
  constructor(
    @InjectRepository(MoodPreset)
    private readonly presetRepo: Repository<MoodPreset>,
    @InjectRepository(MoodStatusEvent)
    private readonly eventRepo: Repository<MoodStatusEvent>,
    private readonly safetyService: SafetyService,
    private readonly config: ConfigService<CoreApiEnv, true>,
  ) {}

  /** Catalog preset đang bật, sắp theo sortOrder — client dùng để dựng UI chọn mood. */
  async listPresets(): Promise<MoodPreset[]> {
    return this.presetRepo.find({
      where: { active: true },
      order: { sortOrder: 'ASC', code: 'ASC' },
    });
  }

  /**
   * Set mood theo preset — idempotent theo `idempotencyKey` (unique DB). Preset auto-approve
   * (W1 không có free-text nên không cần trạng thái duyệt). Re-set cùng preset vẫn tạo dòng mới
   * (refresh TTL) — đây là hành vi đúng, không phải bug (user "khẳng định lại" mood vẫn còn hợp lệ).
   */
  async setMood(
    userId: string,
    presetCode: string,
    idempotencyKey: string,
  ): Promise<CurrentMood> {
    const preset = await this.presetRepo.findOneBy({
      code: presetCode,
      active: true,
    });
    if (!preset) {
      throw new DomainException(
        MoodErrors.PRESET_NOT_FOUND,
        `Preset mood '${presetCode}' không tồn tại hoặc đã tắt`,
        HttpStatus.NOT_FOUND,
      );
    }

    const key = moodSetIdempotencyKey(userId, idempotencyKey);
    const ttlHours = this.config.getOrThrow('MOOD_STATUS_TTL_HOURS', {
      infer: true,
    });
    const setAt = new Date();
    const expiresAt = new Date(setAt.getTime() + ttlHours * 3600 * 1000);

    const event = await this.insertEventIdempotent(key, () =>
      this.eventRepo.create({
        userId,
        presetId: preset.id,
        kind: MoodEventKind.Set,
        expiresAt,
        idempotencyKey: key,
      }),
    );

    return {
      preset,
      setAt: event.createdAt,
      expiresAt: event.expiresAt as Date,
    };
  }

  /** Tắt mood — idempotent theo `idempotencyKey`. Retry lặp lại chỉ tạo thêm 1 dòng clear vô hại. */
  async clearMood(userId: string, idempotencyKey: string): Promise<void> {
    const key = moodClearIdempotencyKey(userId, idempotencyKey);
    await this.insertEventIdempotent(key, () =>
      this.eventRepo.create({
        userId,
        presetId: null,
        kind: MoodEventKind.Clear,
        expiresAt: null,
        idempotencyKey: key,
      }),
    );
  }

  /** Mood hiện tại của chính mình — không qua block-check (không tự block chính mình). */
  async getMyMood(userId: string): Promise<CurrentMood | null> {
    return this.deriveCurrentMood(userId);
  }

  /**
   * Mood công khai của `targetId` theo góc nhìn `viewerId` — composition dùng ở nơi khác (friend
   * list, discovery card...) qua DI, KHÔNG sửa `PublicProfileDto`. Ẩn 2 chiều nếu có block (block
   * active — không xét report, khác `SafetyService.getHiddenUserIds` của Discovery). Re-check
   * block MỖI LẦN gọi (không cache) — đúng tinh thần xác minh lại đúng thời điểm đọc (docs/10 § 10.0.C).
   *
   * KHÔNG gọi hàm này ở card ẩn danh trước-match Soul Match — giữ bất biến ẩn danh (docs/06).
   */
  async getPublicMood(
    viewerId: string,
    targetId: string,
  ): Promise<CurrentMood | null> {
    if (viewerId !== targetId) {
      const blockedIds = await this.safetyService.getBlockedUserIds(viewerId);
      if (blockedIds.includes(targetId)) return null;
    }
    return this.deriveCurrentMood(targetId);
  }

  /**
   * Dòng mới nhất của user quyết định mood hiện tại — không phải `clear` và chưa quá `expiresAt`
   * (giờ server tại thời điểm ĐỌC, không phải lúc set — triết lý derive-khi-đọc như VIP downgrade).
   */
  private async deriveCurrentMood(userId: string): Promise<CurrentMood | null> {
    const latest = await this.eventRepo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    if (!latest) return null;
    if (latest.kind === MoodEventKind.Clear) return null;
    if (!latest.expiresAt || latest.expiresAt <= new Date()) return null;

    const preset = await this.presetRepo.findOneBy({
      id: latest.presetId as string,
    });
    if (!preset) return null; // preset bị xoá/tắt sau khi set — coi như hết mood, không 500

    return { preset, setAt: latest.createdAt, expiresAt: latest.expiresAt };
  }

  /**
   * Insert 1 dòng event, coi unique violation trên `idempotencyKey` là replay hợp lệ — đọc lại
   * dòng đã tồn tại thay vì lỗi (docs/05 § 5.10, cùng pattern `party-room.service.ts` joinRoom).
   */
  private async insertEventIdempotent(
    idempotencyKey: string,
    build: () => MoodStatusEvent,
  ): Promise<MoodStatusEvent> {
    try {
      return await this.eventRepo.save(build());
    } catch (err) {
      if (isUniqueViolation(err)) {
        return await this.eventRepo.findOneByOrFail({ idempotencyKey });
      }
      throw err;
    }
  }
}
