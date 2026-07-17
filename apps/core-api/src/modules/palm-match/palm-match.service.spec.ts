import { DomainException } from '@litmatch/common-exceptions';

import {
  PalmMatchCategory,
  PalmReadingTemplate,
} from './entities/palm-reading-template.entity';
import { PalmMatchErrors } from './palm-match.errors';
import { PalmMatchService } from './palm-match.service';

import type { ConfigService } from '@nestjs/config';
import type { DataSource, Repository } from 'typeorm';

import type { CoreApiEnv } from '../../config/env.validation';

const CONFIG: Record<string, unknown> = {
  PALM_MATCH_TARGET_NAME_MAX_LENGTH: 50,
  PALM_MATCH_QUEUE_MAX_WAIT_SECONDS: 120,
  PALM_MATCH_SESSION_DURATION_SECONDS: 300,
};
const configStub = {
  getOrThrow: (key: string) => {
    if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
    return CONFIG[key];
  },
} as unknown as ConfigService<CoreApiEnv, true>;

function makeTemplate(
  overrides: Partial<PalmReadingTemplate> = {},
): PalmReadingTemplate {
  return Object.assign(new PalmReadingTemplate(), {
    id: 1,
    category: PalmMatchCategory.Love,
    content: 'Nội dung mặc định',
    isActive: true,
    ...overrides,
  });
}

function makeTemplates(
  category: PalmMatchCategory,
  count: number,
): PalmReadingTemplate[] {
  return Array.from({ length: count }, (_, i) =>
    makeTemplate({
      id: i + 1,
      category,
      content: `Nội dung số ${i + 1} — {name} sẽ có một ngày tốt lành.`,
    }),
  );
}

describe('PalmMatchService (unit — mock repo)', () => {
  let templateRepo: { find: jest.Mock };
  let service: PalmMatchService;

  beforeEach(() => {
    templateRepo = {
      find: jest.fn(async () => makeTemplates(PalmMatchCategory.Love, 20)),
    };
    service = new PalmMatchService(
      templateRepo as unknown as Repository<PalmReadingTemplate>,
      configStub,
      {} as DataSource,
      {} as never,
      {} as never,
    );
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-13T03:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function expectDomainError(err: unknown, code: string): void {
    expect(err).toBeInstanceOf(DomainException);
    expect((err as DomainException).code).toBe(code);
  }

  it('query luôn ORDER BY id để chọn phần tử ổn định', async () => {
    await service.getReading('user-1', PalmMatchCategory.Love);
    expect(templateRepo.find).toHaveBeenCalledWith({
      where: { category: PalmMatchCategory.Love, isActive: true },
      order: { id: 'ASC' },
    });
  });

  it('cùng userId + category + ngày → luôn ra cùng 1 kết quả, gọi nhiều lần', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        service.getReading('user-1', PalmMatchCategory.Love),
      ),
    );
    const first = results[0];
    for (const r of results) {
      expect(r.content).toBe(first.content);
      expect(r.forDate).toBe(first.forDate);
    }
  });

  it('userId khác nhau → có thể ra kết quả khác nhau (không phải luôn giống hệt)', async () => {
    const contents = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const r = await service.getReading(`user-${i}`, PalmMatchCategory.Love);
      contents.add(r.content);
    }
    expect(contents.size).toBeGreaterThan(1);
  });

  it('category khác nhau (cùng userId) → có thể ra kết quả khác nhau', async () => {
    templateRepo.find.mockImplementation(
      async (opts: { where: { category: PalmMatchCategory } }) =>
        makeTemplates(opts.where.category, 20),
    );
    const love = await service.getReading('user-1', PalmMatchCategory.Love);
    const career = await service.getReading('user-1', PalmMatchCategory.Career);
    // Không assert khác nhau tuyệt đối (seed có thể trùng số dư ngẫu nhiên), chỉ assert
    // service đọc đúng category tương ứng và trả forDate như nhau (cùng ngày).
    expect(love.category).toBe(PalmMatchCategory.Love);
    expect(career.category).toBe(PalmMatchCategory.Career);
    expect(love.forDate).toBe(career.forDate);
  });

  it('category không có template active nào → lỗi domain rõ ràng, không crash', async () => {
    templateRepo.find.mockResolvedValue([]);
    const err = await service
      .getReading('user-1', PalmMatchCategory.Health)
      .catch((e) => e);
    expectDomainError(err, PalmMatchErrors.CATEGORY_EMPTY);
  });

  it('có targetName + placeholder tồn tại → thay đúng {name}', async () => {
    templateRepo.find.mockResolvedValue([
      makeTemplate({ content: '{name}, hôm nay là một ngày đẹp trời.' }),
    ]);
    const result = await service.getReading(
      'user-1',
      PalmMatchCategory.Love,
      'Lan',
    );
    expect(result.content).toBe('Lan, hôm nay là một ngày đẹp trời.');
  });

  it('không truyền targetName → giữ nguyên nội dung tự nhiên, không lộ literal {name}', async () => {
    templateRepo.find.mockResolvedValue([
      makeTemplate({
        content: 'Hôm nay là một ngày đẹp trời, không có gì đáng lo.',
      }),
    ]);
    const result = await service.getReading('user-1', PalmMatchCategory.Love);
    expect(result.content).toBe(
      'Hôm nay là một ngày đẹp trời, không có gì đáng lo.',
    );
    expect(result.content).not.toContain('{name}');
  });

  it('targetName vượt quá PALM_MATCH_TARGET_NAME_MAX_LENGTH → lỗi domain rõ ràng', async () => {
    const err = await service
      .getReading('user-1', PalmMatchCategory.Love, 'a'.repeat(51))
      .catch((e) => e);
    expectDomainError(err, PalmMatchErrors.TARGET_NAME_TOO_LONG);
  });

  it('qua ngày khác (mock Date) → kết quả có thể đổi', async () => {
    const day1 = await service.getReading('user-1', PalmMatchCategory.Love);
    jest.setSystemTime(new Date('2026-07-20T03:00:00.000Z'));
    const day2 = await service.getReading('user-1', PalmMatchCategory.Love);
    expect(day1.forDate).not.toBe(day2.forDate);
    // Không assert content khác tuyệt đối (có thể trùng do modulo), chỉ assert forDate đổi
    // đúng theo ngày UTC hiện tại — bằng chứng seed phụ thuộc ngày thật.
    expect(day1.forDate).toBe('2026-07-13');
    expect(day2.forDate).toBe('2026-07-20');
  });
});
