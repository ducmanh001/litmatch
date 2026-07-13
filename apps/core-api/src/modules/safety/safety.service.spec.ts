import { DomainException } from '@litmatch/common-exceptions';

import { SafetyService } from './safety.service';
import { SafetyErrors } from './safety.errors';
import { Block, BlockAction } from './entities/block.entity';
import { Report, ReportReason } from './entities/report.entity';

import type { ConfigService } from '@nestjs/config';
import type { EntityManager, Repository } from 'typeorm';
import type { CoreApiEnv } from '../../config/env.validation';
import type { UserService } from '../user';

const CONFIG: Record<string, unknown> = {
  SAFETY_REMATCH_COOLDOWN_DAYS: 30,
  SAFETY_REPORT_COOLDOWN_DAYS: 7,
  SAFETY_TRUST_PENALTY_PER_REPORT: 5,
  SAFETY_TRUST_PENALTY_DAILY_CAP: 20,
  SAFETY_TRUST_SCORE_FLOOR: 0,
};
const configStub = {
  getOrThrow: (key: string) => {
    if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
    return CONFIG[key];
  },
} as unknown as ConfigService<CoreApiEnv, true>;

function queryBuilderStub(sum: number) {
  const qb = {
    select: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    getRawOne: jest.fn(async () => ({ sum: String(sum) })),
  };
  qb.select.mockReturnValue(qb);
  qb.where.mockReturnValue(qb);
  qb.andWhere.mockReturnValue(qb);
  return qb;
}

describe('SafetyService', () => {
  let reportRepo: { exists: jest.Mock };
  let blockRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    exists: jest.Mock;
  };
  let userService: { getByIdOrThrow: jest.Mock; adjustTrustScore: jest.Mock };
  let manager: {
    count: jest.Mock;
    createQueryBuilder: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let service: SafetyService;

  beforeEach(() => {
    reportRepo = { exists: jest.fn(async () => false) };
    blockRepo = {
      findOne: jest.fn(async () => null),
      save: jest.fn(async (b) => b),
      create: jest.fn((input) => Object.assign(new Block(), input)),
      exists: jest.fn(async () => false),
    };
    userService = {
      getByIdOrThrow: jest.fn(async () => ({ id: 'target' })),
      adjustTrustScore: jest.fn(async () => undefined),
    };
    manager = {
      count: jest.fn(async () => 0),
      createQueryBuilder: jest.fn(() => queryBuilderStub(0)),
      create: jest.fn((_entity, input) => Object.assign(new Report(), input)),
      save: jest.fn(async (r) => r),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (m: EntityManager) => Promise<unknown>) =>
        cb(manager as unknown as EntityManager),
      ),
    };
    service = new SafetyService(
      dataSource as never,
      reportRepo as unknown as Repository<Report>,
      blockRepo as unknown as Repository<Block>,
      userService as unknown as UserService,
      configStub,
    );
  });

  function expectDomainError(err: unknown, code: string): void {
    expect(err).toBeInstanceOf(DomainException);
    expect((err as DomainException).code).toBe(code);
  }

  describe('report', () => {
    it('tự report chính mình → chặn, không đụng DB', async () => {
      expectDomainError(
        await service.report('u1', 'u1', ReportReason.Spam).catch((e) => e),
        SafetyErrors.SELF_REPORT_FORBIDDEN,
      );
      expect(userService.getByIdOrThrow).not.toHaveBeenCalled();
    });

    it('report hợp lệ đầu tiên — trừ đúng SAFETY_TRUST_PENALTY_PER_REPORT', async () => {
      const report = await service.report(
        'reporter',
        'target',
        ReportReason.Harassment,
        'mô tả',
      );
      expect(report.trustPenaltyApplied).toBe(5);
      expect(userService.adjustTrustScore).toHaveBeenCalledWith(
        manager,
        'target',
        -5,
        0,
      );
    });

    it('report lặp lại CÙNG cặp trong cooldown — vẫn ghi log, penalty = 0 (chống vote-kick)', async () => {
      manager.count.mockResolvedValueOnce(1); // đã có report hiệu lực gần đây của đúng cặp
      const report = await service.report(
        'reporter',
        'target',
        ReportReason.Spam,
      );
      expect(report.trustPenaltyApplied).toBe(0);
      expect(userService.adjustTrustScore).not.toHaveBeenCalled();
    });

    it('daily cap: clip penalty theo phần còn lại thay vì full mỗi report khác reporter', async () => {
      manager.createQueryBuilder.mockReturnValue(queryBuilderStub(18)); // đã áp 18/20 hôm nay
      const report = await service.report(
        'reporterB',
        'target',
        ReportReason.Spam,
      );
      expect(report.trustPenaltyApplied).toBe(2);
      expect(userService.adjustTrustScore).toHaveBeenCalledWith(
        manager,
        'target',
        -2,
        0,
      );
    });

    it('daily cap đã đầy — report thêm không trừ điểm', async () => {
      manager.createQueryBuilder.mockReturnValue(queryBuilderStub(20));
      const report = await service.report(
        'reporterC',
        'target',
        ReportReason.Spam,
      );
      expect(report.trustPenaltyApplied).toBe(0);
      expect(userService.adjustTrustScore).not.toHaveBeenCalled();
    });
  });

  describe('block / unblock — idempotent', () => {
    it('tự block chính mình → chặn', async () => {
      expectDomainError(
        await service.block('u1', 'u1').catch((e) => e),
        SafetyErrors.SELF_BLOCK_FORBIDDEN,
      );
    });

    it('block mới → ghi dòng blocked', async () => {
      blockRepo.findOne.mockResolvedValue(null);
      await service.block('a', 'b');
      expect(blockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          blockerUserId: 'a',
          blockedUserId: 'b',
          action: BlockAction.Blocked,
        }),
      );
    });

    it('block khi đã đang block → no-op, không ghi trùng', async () => {
      blockRepo.findOne.mockResolvedValue({ action: BlockAction.Blocked });
      await service.block('a', 'b');
      expect(blockRepo.save).not.toHaveBeenCalled();
    });

    it('unblock khi đang block → ghi dòng unblocked', async () => {
      blockRepo.findOne.mockResolvedValue({ action: BlockAction.Blocked });
      await service.unblock('a', 'b');
      expect(blockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ action: BlockAction.Unblocked }),
      );
    });

    it('unblock khi chưa từng block → no-op', async () => {
      blockRepo.findOne.mockResolvedValue(null);
      await service.unblock('a', 'b');
      expect(blockRepo.save).not.toHaveBeenCalled();
    });

    it('isBlocked phản ánh đúng action mới nhất', async () => {
      blockRepo.findOne.mockResolvedValue({ action: BlockAction.Blocked });
      expect(await service.isBlocked('a', 'b')).toBe(true);
      blockRepo.findOne.mockResolvedValue({ action: BlockAction.Unblocked });
      expect(await service.isBlocked('a', 'b')).toBe(false);
    });
  });

  describe('canPair — implementation thật của MatchInteractionPolicy', () => {
    it('không có block/report nào → true', async () => {
      expect(await service.canPair('a', 'b')).toBe(true);
    });

    it('có block đang active (1 chiều bất kỳ) → false', async () => {
      blockRepo.findOne.mockImplementation(
        async ({ where }: { where: { blockerUserId: string } }) =>
          where.blockerUserId === 'a' ? { action: BlockAction.Blocked } : null,
      );
      expect(await service.canPair('a', 'b')).toBe(false);
    });

    it('có report gần đây trong cooldown (kể cả chưa admin xử lý) → false', async () => {
      reportRepo.exists.mockResolvedValue(true);
      expect(await service.canPair('a', 'b')).toBe(false);
    });

    it('đã unblock nhưng sự kiện còn trong cooldown window → vẫn false', async () => {
      blockRepo.findOne.mockResolvedValue(null); // không active
      blockRepo.exists.mockResolvedValue(true); // nhưng có sự kiện trong window
      expect(await service.canPair('a', 'b')).toBe(false);
    });
  });
});
