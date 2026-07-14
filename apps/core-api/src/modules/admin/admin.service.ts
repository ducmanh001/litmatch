import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { DataSource } from 'typeorm';

import { AuditLogService } from '../../common/audit/audit-log.service';
import { User, UserService } from '../user';
import { Report, ReportStatus, SafetyService } from '../safety';
import { Gift, GiftService } from '../gift';
import { EconomyService } from '../economy';
import { ShortVideoService, Video } from '../short-video';

import { AdminErrors } from './admin.errors';

import type { UserPage, UserPageFilter } from '../user';
import type { ReportPage, ReportPageFilter } from '../safety';
import type { CreateGiftInput, UpdateGiftInput } from '../gift';
import type {
  CursorPage,
  CursorPageMeta,
  CursorPageQueryDto,
} from '@litmatch/common-dtos';
import type { TransactionView, WalletView } from '../economy';

@Injectable()
export class AdminService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly userService: UserService,
    private readonly safetyService: SafetyService,
    private readonly giftService: GiftService,
    private readonly economyService: EconomyService,
    private readonly shortVideoService: ShortVideoService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async getUser(userId: string): Promise<User> {
    return this.userService.getByIdOrThrow(userId);
  }

  async listUsers(
    filter: UserPageFilter,
    limit: number,
    offset: number,
  ): Promise<UserPage> {
    return this.userService.findPage(filter, limit, offset);
  }

  /**
   * Ban + ghi audit atomic trong CÙNG transaction (docs/06: hành động nhạy cảm không được
   * "thành công 1 nửa"). Chặn tự ban chính mình — tránh admin tự khoá mất quyền truy cập.
   */
  async banUser(actorUserId: string, targetUserId: string): Promise<User> {
    if (actorUserId === targetUserId) {
      throw new DomainException(
        AdminErrors.CANNOT_BAN_SELF,
        'Không thể tự khoá tài khoản của chính mình',
        HttpStatus.FORBIDDEN,
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const user = await this.userService.banUser(manager, targetUserId);
      await this.auditLogService.record(
        {
          actorUserId,
          action: 'user.banned',
          targetType: 'user',
          targetId: targetUserId,
        },
        manager,
      );
      return user;
    });
  }

  async unbanUser(actorUserId: string, targetUserId: string): Promise<User> {
    return this.dataSource.transaction(async (manager) => {
      const user = await this.userService.unbanUser(manager, targetUserId);
      await this.auditLogService.record(
        {
          actorUserId,
          action: 'user.unbanned',
          targetType: 'user',
          targetId: targetUserId,
        },
        manager,
      );
      return user;
    });
  }

  async listReports(
    filter: ReportPageFilter,
    limit: number,
    offset: number,
  ): Promise<ReportPage> {
    return this.safetyService.findReportsPage(filter, limit, offset);
  }

  async resolveReport(actorUserId: string, reportId: string): Promise<Report> {
    return this.setReportStatus(actorUserId, reportId, ReportStatus.Resolved);
  }

  async dismissReport(actorUserId: string, reportId: string): Promise<Report> {
    return this.setReportStatus(actorUserId, reportId, ReportStatus.Dismissed);
  }

  private async setReportStatus(
    actorUserId: string,
    reportId: string,
    status: ReportStatus,
  ): Promise<Report> {
    return this.dataSource.transaction(async (manager) => {
      const report = await this.safetyService.setReportStatus(
        manager,
        reportId,
        status,
      );
      await this.auditLogService.record(
        {
          actorUserId,
          action: `report.${status}`,
          targetType: 'report',
          targetId: reportId,
        },
        manager,
      );
      return report;
    });
  }

  /** `VIDEO_MODERATION_MODE=pre` — video chờ duyệt trước khi public. */
  async listPendingVideos(
    query: CursorPageQueryDto,
  ): Promise<CursorPage<Video>> {
    return this.shortVideoService.listPendingReview(query);
  }

  async approveVideo(actorUserId: string, videoId: string): Promise<Video> {
    return this.dataSource.transaction(async (manager) => {
      const video = await this.shortVideoService.adminApprove(videoId, manager);
      await this.auditLogService.record(
        {
          actorUserId,
          action: 'video.approved',
          targetType: 'video',
          targetId: videoId,
        },
        manager,
      );
      return video;
    });
  }

  async rejectVideo(actorUserId: string, videoId: string): Promise<Video> {
    return this.dataSource.transaction(async (manager) => {
      const video = await this.shortVideoService.adminReject(videoId, manager);
      await this.auditLogService.record(
        {
          actorUserId,
          action: 'video.rejected',
          targetType: 'video',
          targetId: videoId,
        },
        manager,
      );
      return video;
    });
  }

  /** Gỡ thủ công 1 video đang published — bổ sung cho auto-hide theo ngưỡng report. */
  async removeVideo(actorUserId: string, videoId: string): Promise<Video> {
    return this.dataSource.transaction(async (manager) => {
      const video = await this.shortVideoService.adminRemove(videoId, manager);
      await this.auditLogService.record(
        {
          actorUserId,
          action: 'video.removed',
          targetType: 'video',
          targetId: videoId,
        },
        manager,
      );
      return video;
    });
  }

  async listGifts(): Promise<Gift[]> {
    return this.giftService.listAllForAdmin();
  }

  async createGift(actorUserId: string, input: CreateGiftInput): Promise<Gift> {
    return this.dataSource.transaction(async (manager) => {
      const gift = await this.giftService.createGift(manager, input);
      await this.auditLogService.record(
        {
          actorUserId,
          action: 'gift.created',
          targetType: 'gift',
          targetId: gift.id,
          metadata: { code: gift.code },
        },
        manager,
      );
      return gift;
    });
  }

  async updateGift(
    actorUserId: string,
    giftId: string,
    input: UpdateGiftInput,
  ): Promise<Gift> {
    return this.dataSource.transaction(async (manager) => {
      const gift = await this.giftService.updateGift(manager, giftId, input);
      await this.auditLogService.record(
        {
          actorUserId,
          action: 'gift.updated',
          targetType: 'gift',
          targetId: giftId,
          metadata: { ...input },
        },
        manager,
      );
      return gift;
    });
  }

  async getWallet(userId: string): Promise<WalletView> {
    return this.economyService.getWallet(userId);
  }

  /**
   * Lịch sử giao dịch của user (docs/12 § 12.7) — tái dùng nguyên `listTransactions` hiện có,
   * actor-scoped: CHƯA thấy giao dịch user chỉ là người NHẬN (vd nhận quà) — giới hạn biết
   * trước cho v1, không viết query ledger mới ở đây.
   */
  async listTransactions(
    userId: string,
    limit: number,
    cursor?: string,
  ): Promise<{ items: TransactionView[]; meta: CursorPageMeta }> {
    const page = await this.economyService.listTransactions(
      userId,
      limit,
      cursor,
    );
    return { items: page.data, meta: page.meta };
  }

  /**
   * Hoàn tiền thủ công 1 giao dịch — audit log ghi CÙNG DB transaction với bút toán đảo
   * (qua `withinTransaction` của `ledger.reverse`, không phải transaction riêng của
   * AdminService — economy giữ vai trò writer/facade duy nhất, docs/06).
   */
  async refundTransaction(
    actorUserId: string,
    transactionId: string,
    reason: string,
  ): Promise<{ transactionId: string; reversalTransactionId: string }> {
    return this.economyService.adminRefundTransaction(
      transactionId,
      reason,
      actorUserId,
      async (manager) => {
        await this.auditLogService.record(
          {
            actorUserId,
            action: 'economy.transaction.refunded',
            targetType: 'transaction',
            targetId: transactionId,
            metadata: { reason },
          },
          manager,
        );
      },
    );
  }
}
