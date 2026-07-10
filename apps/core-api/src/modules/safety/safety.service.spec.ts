import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';

import { SafetyErrors } from './safety.errors';
import { SafetyService } from './safety.service';
import { SafetyReport } from './entities/report.entity';
import { UserBlock, UserBlockStatus } from './entities/user-block.entity';

describe('SafetyService policy/validation', () => {
  const blockRepo = { findBy: jest.fn() } as unknown as Repository<UserBlock>;
  const reportRepo = { find: jest.fn() } as unknown as Repository<SafetyReport>;
  const dataSource = { transaction: jest.fn() } as unknown as DataSource;
  const userService = { getByIdOrThrow: jest.fn() };
  const config = { get: jest.fn() } as unknown as ConfigService;
  const service = new SafetyService(blockRepo, reportRepo, dataSource, userService as never, config);

  const userAId = '00000000-0000-4000-8000-000000000001';
  const userBId = '00000000-0000-4000-8000-000000000002';
  const userCId = '00000000-0000-4000-8000-000000000003';

  beforeEach(() => jest.clearAllMocks());

  it('mutation thiếu Idempotency-Key bị chặn trước transaction', async () => {
    await expect(service.createBlock(userAId, userBId, undefined)).rejects.toMatchObject({
      code: SafetyErrors.IDEMPOTENCY_KEY_MISSING,
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('không cho block/report chính mình', async () => {
    await expect(service.createBlock(userAId, userAId, 'key')).rejects.toMatchObject({
      code: SafetyErrors.SELF_ACTION_FORBIDDEN,
    });
    await expect(
      service.createReport(userAId, { reportedUserId: userAId, category: 'other' as never }, 'key'),
    ).rejects.toMatchObject({ code: SafetyErrors.SELF_ACTION_FORBIDDEN });
  });

  it('batch lookup coi block ở bất kỳ chiều nào là chặn tương tác', async () => {
    (blockRepo.findBy as jest.Mock).mockResolvedValue([
      { blockerUserId: userBId, blockedUserId: userAId, status: UserBlockStatus.Active },
    ]);

    await expect(service.assertInteractionAllowed(userAId, userBId)).rejects.toMatchObject({
      code: SafetyErrors.INTERACTION_BLOCKED,
    });
    const blocked = await service.findBlockedPairs([
      { userAId, userBId },
      { userAId, userBId: userCId },
    ]);
    expect(blocked).toEqual([{ userAId, userBId }]);
  });

  it('list report luôn scope theo reporter đăng nhập (IDOR guard)', async () => {
    (reportRepo.find as jest.Mock).mockResolvedValue([]);
    await service.listOwnReports(userAId);
    expect(reportRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { reporterUserId: userAId }, take: 50 }),
    );
  });

  it('evidence trùng cùng kind/reference bị chặn trước khi ghi DB', async () => {
    const evidence = { kind: 'message', referenceId: userCId } as never;
    await expect(
      service.createReport(
        userAId,
        { reportedUserId: userBId, category: 'harassment' as never, evidence: [evidence, evidence] },
        'report-key',
      ),
    ).rejects.toMatchObject({ code: SafetyErrors.EVIDENCE_INVALID });
    expect(userService.getByIdOrThrow).not.toHaveBeenCalled();
  });

  it('batch quá lớn bị từ chối để tránh query không giới hạn', async () => {
    const pairs = Array.from({ length: 501 }, () => ({ userAId, userBId }));
    await expect(service.findBlockedPairs(pairs)).rejects.toMatchObject({ code: SafetyErrors.BATCH_TOO_LARGE });
  });
});
