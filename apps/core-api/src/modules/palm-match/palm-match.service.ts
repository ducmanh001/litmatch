import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { Repository } from 'typeorm';

import { palmMatchSeedInput, todayUtcDateString } from './palm-match.constants';
import {
  PalmMatchCategory,
  PalmReadingTemplate,
} from './entities/palm-reading-template.entity';
import { fnv1aHash } from './palm-match.hash';
import { PalmMatchErrors } from './palm-match.errors';

import type { CoreApiEnv } from '../../config/env.validation';

export interface PalmMatchReading {
  category: PalmMatchCategory;
  content: string;
  forDate: string;
}

/**
 * Facade Palm Match (docs/services/palm-match-service.md): nội dung bói toán giải trí
 * template + random DETERMINISTIC — không phải AI thật, không lưu lịch sử. Cùng
 * `(userId, category, ngày server UTC)` luôn ra cùng 1 kết quả trong ngày; qua ngày khác đổi
 * seed → có thể đổi kết quả. Seed tính hoàn toàn ở server, client không gửi/chọn được (chống
 * "quay số" — docs/10 § Palm Match).
 */
@Injectable()
export class PalmMatchService {
  constructor(
    @InjectRepository(PalmReadingTemplate)
    private readonly templateRepo: Repository<PalmReadingTemplate>,
    private readonly config: ConfigService<CoreApiEnv, true>,
  ) {}

  async getReading(
    userId: string,
    category: PalmMatchCategory,
    targetName?: string,
  ): Promise<PalmMatchReading> {
    const trimmedTargetName = this.assertAndTrimTargetName(targetName);

    // ORDER BY id bắt buộc — không có thì Postgres có thể trả thứ tự khác nhau giữa các lần gọi,
    // phá tính deterministic của `templates[seed % templates.length]` (spec § 3).
    const templates = await this.templateRepo.find({
      where: { category, isActive: true },
      order: { id: 'ASC' },
    });
    if (templates.length === 0) {
      throw new DomainException(
        PalmMatchErrors.CATEGORY_EMPTY,
        `Không có nội dung bói toán cho category '${category}'`,
        HttpStatus.CONFLICT,
      );
    }

    // `new Date()` gọi TẠI ĐÂY, lúc request tới — không cache/tính sẵn (spec § 1).
    const forDate = todayUtcDateString(new Date());
    const seed = fnv1aHash(palmMatchSeedInput(userId, category, forDate));
    const template = templates[seed % templates.length];

    return {
      category,
      content: this.applyTargetName(template.content, trimmedTargetName),
      forDate,
    };
  }

  // ---------- nội bộ ----------

  private assertAndTrimTargetName(targetName?: string): string | undefined {
    const trimmed = targetName?.trim();
    if (!trimmed) return undefined;

    const maxLength = this.config.getOrThrow(
      'PALM_MATCH_TARGET_NAME_MAX_LENGTH',
      { infer: true },
    );
    if (trimmed.length > maxLength) {
      throw new DomainException(
        PalmMatchErrors.TARGET_NAME_TOO_LONG,
        `targetName dài quá ${maxLength} ký tự`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { maxLength },
      );
    }
    return trimmed;
  }

  /** Không truyền targetName → giữ nguyên content, câu phải tự nhiên (seed data đảm bảo). */
  private applyTargetName(content: string, targetName?: string): string {
    if (!targetName) return content;
    return content.split('{name}').join(targetName);
  }
}
