import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Roles } from '@litmatch/common-dtos';
import { DomainException } from '@litmatch/common-exceptions';
import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';

import { AuditLogService } from '../../common/audit/audit-log.service';
import { User, UserService } from '../user';
import { Report, ReportStatus, SafetyService } from '../safety';
import { Gift, GiftService } from '../gift';
import { EconomyService } from '../economy';
import { ShortVideoService, Video } from '../short-video';
import { NotificationService } from '../notification';
import { PartyRoomCloseReason, PartyRoomService } from '../party-room';
import { SupportService, SupportTicketStatus } from '../support';

import { AdminErrors } from './admin.errors';
import { BroadcastAudience } from './dto/admin-config.dto';
import { AdminPermission, ADMIN_PERMISSION_LABELS } from './admin.constants';
import { AdminRolePermission } from './entities/admin-role-permission.entity';

import type { UserPage, UserPageFilter } from '../user';
import type { ReportPage, ReportPageFilter } from '../safety';
import type { CreateGiftInput, UpdateGiftInput } from '../gift';
import type {
  CursorPage,
  CursorPageMeta,
  CursorPageQueryDto,
} from '@litmatch/common-dtos';
import type { TransactionView, WalletView } from '../economy';
import type { Role } from '@litmatch/common-dtos';
import type { IapProductCatalogView, VipPlanCatalogView } from '../economy';

@Injectable()
export class AdminService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(AdminRolePermission)
    private readonly rolePermissionRepo: Repository<AdminRolePermission>,
    private readonly userService: UserService,
    private readonly safetyService: SafetyService,
    private readonly giftService: GiftService,
    private readonly economyService: EconomyService,
    private readonly shortVideoService: ShortVideoService,
    private readonly partyRoomService: PartyRoomService,
    private readonly supportService: SupportService,
    private readonly notificationService: NotificationService,
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

  async listPublishedVideos(
    query: CursorPageQueryDto,
  ): Promise<CursorPage<Video>> {
    return this.shortVideoService.listPublished({ ...query, sort: 'recent' });
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

  /** Close room và audit cùng transaction; cleanup SFU/realtime chạy sau commit trong owner. */
  async closePartyRoom(
    actorUserId: string,
    roomId: string,
  ): Promise<{ closed: boolean }> {
    const result = await this.partyRoomService.closeRoomById(
      roomId,
      PartyRoomCloseReason.AdminClosed,
      undefined,
      async (manager) => {
        await this.auditLogService.record(
          {
            actorUserId,
            action: 'party_room.admin_closed',
            targetType: 'party_room',
            targetId: roomId,
          },
          manager,
        );
      },
    );
    return { closed: result.closed };
  }

  listPartyRooms(limit: number, cursor?: string) {
    return this.partyRoomService.listRoomsWithMemberCounts(limit, cursor);
  }

  listSupportTickets(
    limit: number,
    cursor?: string,
    status?: SupportTicketStatus,
  ) {
    return this.supportService.listAll(limit, cursor, status);
  }

  updateSupportTicket(
    actorUserId: string,
    ticketId: string,
    input: { status: SupportTicketStatus; staffResponse?: string },
  ) {
    return this.dataSource.transaction(async (manager) => {
      const ticket = await this.supportService.setStatusWithManager(
        manager,
        ticketId,
        input,
      );
      await this.auditLogService.record(
        {
          actorUserId,
          action: 'support.ticket.updated',
          targetType: 'support_ticket',
          targetId: ticketId,
          metadata: { status: input.status },
        },
        manager,
      );
      return ticket;
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

  async getEconomyCatalog(): Promise<{
    iapProducts: IapProductCatalogView[];
    vipPlans: VipPlanCatalogView[];
  }> {
    return this.economyService.listCatalogForAdmin();
  }

  async setIapProductActive(
    actorUserId: string,
    productId: string,
    active: boolean,
  ): Promise<IapProductCatalogView> {
    return this.dataSource.transaction(async (manager) => {
      const product = await this.economyService.setIapProductActive(
        manager,
        productId,
        active,
      );
      await this.auditLogService.record(
        {
          actorUserId,
          action: 'economy.iap_product.updated',
          targetType: 'iap_product',
          targetId: productId,
          metadata: { active },
        },
        manager,
      );
      return product;
    });
  }

  async setVipPlanActive(
    actorUserId: string,
    planId: string,
    active: boolean,
  ): Promise<VipPlanCatalogView> {
    return this.dataSource.transaction(async (manager) => {
      const plan = await this.economyService.setVipPlanActive(
        manager,
        planId,
        active,
      );
      await this.auditLogService.record(
        {
          actorUserId,
          action: 'economy.vip_plan.updated',
          targetType: 'vip_plan',
          targetId: planId,
          metadata: { active },
        },
        manager,
      );
      return plan;
    });
  }

  async broadcastNotification(
    actorUserId: string,
    input: { title: string; body: string; audience: BroadcastAudience },
  ): Promise<{ broadcastId: string; recipientCount: number }> {
    const activeUserIds = await this.userService.listActiveUserIds();
    const activeVipUserIds = new Set(
      input.audience === BroadcastAudience.All
        ? []
        : await this.economyService.listActiveVipUserIds(),
    );
    const recipientIds = activeUserIds.filter((userId) => {
      if (input.audience === BroadcastAudience.All) return true;
      const isVip = activeVipUserIds.has(userId);
      return input.audience === BroadcastAudience.Vip ? isVip : !isVip;
    });
    const broadcastId = randomUUID();

    const notifications = await this.dataSource.transaction(async (manager) => {
      const created = await this.notificationService.createBroadcastWithManager(
        manager,
        recipientIds,
        { title: input.title, body: input.body },
      );
      await this.auditLogService.record(
        {
          actorUserId,
          action: 'notification.broadcast.sent',
          targetType: 'notification_broadcast',
          targetId: broadcastId,
          metadata: {
            audience: input.audience,
            recipientCount: recipientIds.length,
            title: input.title,
          },
        },
        manager,
      );
      return created;
    });

    // In-app đã commit; push là best-effort và không được rollback broadcast đã ghi.
    await Promise.all(
      notifications.map((notification) =>
        this.notificationService.sendPush(notification),
      ),
    );
    return { broadcastId, recipientCount: recipientIds.length };
  }

  async hasPermission(
    userId: string,
    permission: AdminPermission,
  ): Promise<boolean> {
    const user = await this.userService.getByIdOrThrow(userId);
    if (user.role !== Roles.Admin && user.role !== Roles.Moderator)
      return false;
    const policy = await this.rolePermissionRepo.findOneBy({
      role: user.role,
      permission,
    });
    return policy?.enabled === true;
  }

  async getPermissionMatrix(): Promise<
    Array<{
      permission: AdminPermission;
      label: string;
      moderator: boolean;
      admin: boolean;
    }>
  > {
    const policies = await this.rolePermissionRepo.find();
    return Object.values(AdminPermission).map((permission) => ({
      permission,
      label: ADMIN_PERMISSION_LABELS[permission],
      moderator:
        policies.find(
          (item) =>
            item.role === Roles.Moderator && item.permission === permission,
        )?.enabled === true,
      admin:
        policies.find(
          (item) => item.role === Roles.Admin && item.permission === permission,
        )?.enabled === true,
    }));
  }

  async setRolePermission(
    actorUserId: string,
    role: Role,
    permission: AdminPermission,
    enabled: boolean,
  ): Promise<void> {
    if (role !== Roles.Admin && role !== Roles.Moderator) {
      throw new DomainException(
        AdminErrors.PERMISSION_UNKNOWN,
        'Vai trò không thuộc phạm vi quản trị',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!Object.values(AdminPermission).includes(permission)) {
      throw new DomainException(
        AdminErrors.PERMISSION_UNKNOWN,
        'Quyền quản trị không tồn tại',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      role === Roles.Admin &&
      permission === AdminPermission.ManagePermissions &&
      !enabled
    ) {
      throw new DomainException(
        AdminErrors.CANNOT_DISABLE_PERMISSION_CONTROL,
        'Không thể tắt quyền phân quyền của vai trò admin',
        HttpStatus.CONFLICT,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AdminRolePermission);
      const policy = await repo.findOneBy({ role, permission });
      if (!policy) {
        throw new DomainException(
          AdminErrors.PERMISSION_UNKNOWN,
          'Quyền quản trị không tồn tại',
          HttpStatus.NOT_FOUND,
        );
      }
      policy.enabled = enabled;
      await repo.save(policy);
      await this.auditLogService.record(
        {
          actorUserId,
          action: 'admin.role_permission.updated',
          targetType: 'role_permission',
          targetId: `${role}:${permission}`,
          metadata: { role, permission, enabled },
        },
        manager,
      );
    });
  }

  async listStaff(): Promise<User[]> {
    return this.userService.listStaff();
  }

  async setStaffRole(
    actorUserId: string,
    targetUserId: string,
    role: Role,
  ): Promise<User> {
    if (actorUserId === targetUserId) {
      throw new DomainException(
        AdminErrors.CANNOT_CHANGE_OWN_ROLE,
        'Không thể tự thay đổi vai trò của chính mình',
        HttpStatus.CONFLICT,
      );
    }
    return this.dataSource.transaction(async (manager) => {
      const context = await this.userService.lockRoleAssignmentContext(
        manager,
        targetUserId,
      );
      if (
        context.target.role === Roles.Admin &&
        role !== Roles.Admin &&
        context.adminCount <= 1
      ) {
        throw new DomainException(
          AdminErrors.CANNOT_DEMOTE_LAST_ADMIN,
          'Không thể hạ quyền admin cuối cùng',
          HttpStatus.CONFLICT,
        );
      }
      const previousRole = context.target.role;
      const updated = await this.userService.setRoleWithManager(
        manager,
        context.target,
        role,
      );
      await this.auditLogService.record(
        {
          actorUserId,
          action: 'admin.staff_role.updated',
          targetType: 'user',
          targetId: targetUserId,
          metadata: { previousRole, role },
        },
        manager,
      );
      return updated;
    });
  }

  async getDashboard(): Promise<{
    newUsersToday: number;
    newUsersPreviousDay: number;
    activeUsers: number;
    activeRoomCount: number;
    totalDiamondSpentSevenDays: string;
    dailyDiamondSpent: Array<{ date: string; amount: string }>;
    userTiers: { free: number; vip: number; svip: number };
    recentActivities: Array<{
      id: string;
      actorUserId: string;
      actorNickname: string;
      action: string;
      targetType: string;
      targetId: string;
      createdAt: Date;
    }>;
  }> {
    const [users, economy, activeRoomCount, activities] = await Promise.all([
      this.userService.getAdminStats(),
      this.economyService.getAdminAnalytics(),
      this.partyRoomService.countActiveRooms(),
      this.auditLogService.listRecent(10),
    ]);
    const actors = await this.userService.findByIds(
      activities.map((activity) => activity.actorUserId),
    );
    const nicknameById = new Map(
      actors.map((actor) => [actor.id, actor.nickname]),
    );
    const paidUsers = economy.activeVipUsers + economy.activeSvipUsers;
    return {
      ...users,
      activeRoomCount,
      totalDiamondSpentSevenDays: economy.totalDiamondSpent,
      dailyDiamondSpent: economy.dailyDiamondSpent,
      userTiers: {
        free: Math.max(0, users.activeUsers - paidUsers),
        vip: economy.activeVipUsers,
        svip: economy.activeSvipUsers,
      },
      recentActivities: activities.map((activity) => ({
        id: activity.id,
        actorUserId: activity.actorUserId,
        actorNickname:
          nicknameById.get(activity.actorUserId) ?? activity.actorUserId,
        action: activity.action,
        targetType: activity.targetType,
        targetId: activity.targetId,
        createdAt: activity.createdAt,
      })),
    };
  }
}
