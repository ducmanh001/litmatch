import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CursorPageQueryDto, Roles } from '@litmatch/common-dtos';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireRoles } from '../../common/decorators/roles.decorator';
import { ApiCursorPageQuery } from '../../common/decorators/cursor-page-query.decorator';

import { AdminService } from './admin.service';
import { AdminUserDto } from './dto/admin-user.dto';
import {
  AdminUsersPageDto,
  ListUsersQueryDto,
} from './dto/admin-list-users.dto';
import {
  AdminReportDto,
  AdminReportsPageDto,
  ListReportsQueryDto,
} from './dto/admin-report.dto';
import {
  AdminGiftDto,
  CreateGiftDto,
  UpdateGiftDto,
} from './dto/admin-gift.dto';
import {
  AdminTransactionsPageDto,
  AdminWalletDto,
  RefundResultDto,
  RefundTransactionDto,
} from './dto/admin-economy.dto';
import {
  AdminVideoDto,
  AdminVideosPageDto,
  ListPendingVideosQueryDto,
  ListPublishedVideosQueryDto,
} from './dto/admin-video.dto';
import {
  AdminEconomyCatalogDto,
  AdminIapProductDto,
  AdminVipPlanDto,
  BroadcastNotificationDto,
  BroadcastNotificationResultDto,
  SetCatalogActiveDto,
} from './dto/admin-config.dto';
import {
  AdminPermissionMatrixDto,
  AdminRolePermissionDto,
  AdminStaffDto,
  SetRolePermissionDto,
  SetStaffRoleDto,
} from './dto/admin-permission.dto';
import { AdminPermission } from './admin.constants';
import {
  AdminPermissionGuard,
  RequireAdminPermission,
} from './services/admin-permission.guard';
import { AdminDashboardDto } from './dto/admin-dashboard.dto';
import {
  AdminCloseRoomResultDto,
  AdminRoomsPageDto,
} from './dto/admin-room.dto';
import {
  AdminListSupportTicketsQueryDto,
  AdminSupportTicketDto,
  AdminSupportTicketsPageDto,
  AdminUpdateSupportTicketDto,
} from './dto/admin-support.dto';
import { SupportTicketDto } from '../support';

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { Role } from '@litmatch/common-dtos';

/**
 * Task 0 backend (docs/12 § 12.7) — endpoint tối thiểu chứng minh guard chain RBAC + audit
 * log hoạt động thật. @RequireRoles ở CLASS level: mọi route thêm sau trong controller này
 * tự động bị chặn, không cần nhớ khai lại per-route (docs/10 § "guard route bị coi là chốt
 * chặn thật").
 */
@ApiTags('admin')
@ApiBearerAuth()
@RequireRoles(Roles.Admin, Roles.Moderator)
@UseGuards(AdminPermissionGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @RequireAdminPermission(AdminPermission.ViewUsers)
  @ApiOperation({
    summary: 'Dashboard aggregate + audit activity từ dữ liệu thật',
  })
  @ApiOkResponse({ type: AdminDashboardDto })
  getDashboard(): Promise<AdminDashboardDto> {
    return this.adminService.getDashboard();
  }

  @Get('users')
  @RequireAdminPermission(AdminPermission.ViewUsers)
  @ApiOperation({
    summary: 'Danh sách user — lọc status/role/nickname, offset pagination',
  })
  @ApiOkResponse({ type: AdminUsersPageDto })
  async listUsers(
    @Query() query: ListUsersQueryDto,
  ): Promise<AdminUsersPageDto> {
    const page = await this.adminService.listUsers(
      { status: query.status, role: query.role, nickname: query.nickname },
      query.limit,
      query.offset,
    );
    return AdminUsersPageDto.from(page);
  }

  @Get('users/:id')
  @RequireAdminPermission(AdminPermission.ViewUsers)
  @ApiOperation({
    summary: 'Xem profile nội bộ user (status + role) — chỉ admin/moderator',
  })
  @ApiOkResponse({ type: AdminUserDto })
  async getUser(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserDto> {
    return AdminUserDto.from(await this.adminService.getUser(id));
  }

  @Post('users/:id/ban')
  @RequireAdminPermission(AdminPermission.BanUsers)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Khoá tài khoản user — audit log, không tự ban chính mình được',
  })
  @ApiOkResponse({ type: AdminUserDto })
  async banUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminUserDto> {
    return AdminUserDto.from(await this.adminService.banUser(actor.userId, id));
  }

  @Post('users/:id/unban')
  @RequireAdminPermission(AdminPermission.BanUsers)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mở khoá tài khoản user — audit log' })
  @ApiOkResponse({ type: AdminUserDto })
  async unbanUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminUserDto> {
    return AdminUserDto.from(
      await this.adminService.unbanUser(actor.userId, id),
    );
  }

  @Get('reports')
  @RequireAdminPermission(AdminPermission.ResolveReports)
  @ApiOperation({ summary: 'Moderation queue — lọc status, offset pagination' })
  @ApiOkResponse({ type: AdminReportsPageDto })
  async listReports(
    @Query() query: ListReportsQueryDto,
  ): Promise<AdminReportsPageDto> {
    const page = await this.adminService.listReports(
      { status: query.status },
      query.limit,
      query.offset,
    );
    return AdminReportsPageDto.from(page);
  }

  @Post('reports/:id/resolve')
  @RequireAdminPermission(AdminPermission.ResolveReports)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đánh dấu report đã xử lý — audit log' })
  @ApiOkResponse({ type: AdminReportDto })
  async resolveReport(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminReportDto> {
    return AdminReportDto.from(
      await this.adminService.resolveReport(actor.userId, id),
    );
  }

  @Post('reports/:id/dismiss')
  @RequireAdminPermission(AdminPermission.ResolveReports)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bỏ qua report (không vi phạm) — audit log' })
  @ApiOkResponse({ type: AdminReportDto })
  async dismissReport(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminReportDto> {
    return AdminReportDto.from(
      await this.adminService.dismissReport(actor.userId, id),
    );
  }

  @Get('videos/pending')
  @RequireAdminPermission(AdminPermission.ResolveReports)
  @ApiOperation({
    summary:
      'Video chờ duyệt trước khi public (VIDEO_MODERATION_MODE=pre) — cursor pagination',
  })
  @ApiCursorPageQuery()
  @ApiOkResponse({ type: AdminVideosPageDto })
  async listPendingVideos(
    @Query() query: ListPendingVideosQueryDto,
  ): Promise<AdminVideosPageDto> {
    return AdminVideosPageDto.from(
      await this.adminService.listPendingVideos(query),
    );
  }

  @Get('videos/published')
  @RequireAdminPermission(AdminPermission.ResolveReports)
  @ApiOperation({
    summary:
      'Video đang published để moderator kiểm tra/gỡ — cursor pagination',
  })
  @ApiCursorPageQuery()
  @ApiOkResponse({ type: AdminVideosPageDto })
  async listPublishedVideos(
    @Query() query: ListPublishedVideosQueryDto,
  ): Promise<AdminVideosPageDto> {
    return AdminVideosPageDto.from(
      await this.adminService.listPublishedVideos(query),
    );
  }

  @Post('videos/:id/approve')
  @RequireAdminPermission(AdminPermission.ResolveReports)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Duyệt video pending_review → published — audit log',
  })
  @ApiOkResponse({ type: AdminVideoDto })
  async approveVideo(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminVideoDto> {
    return AdminVideoDto.from(
      await this.adminService.approveVideo(actor.userId, id),
    );
  }

  @Post('videos/:id/reject')
  @RequireAdminPermission(AdminPermission.ResolveReports)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Từ chối video pending_review → rejected — audit log',
  })
  @ApiOkResponse({ type: AdminVideoDto })
  async rejectVideo(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminVideoDto> {
    return AdminVideoDto.from(
      await this.adminService.rejectVideo(actor.userId, id),
    );
  }

  @Post('videos/:id/remove')
  @RequireAdminPermission(AdminPermission.ResolveReports)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Gỡ thủ công video published → removed (bổ sung cho auto-hide theo ngưỡng report) — audit log',
  })
  @ApiOkResponse({ type: AdminVideoDto })
  async removeVideo(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminVideoDto> {
    return AdminVideoDto.from(
      await this.adminService.removeVideo(actor.userId, id),
    );
  }

  @Post('rooms/:id/close')
  @RequireAdminPermission(AdminPermission.ManageRooms)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Kết thúc Party Room đang live — idempotent + audit log',
  })
  @ApiOkResponse({ type: AdminCloseRoomResultDto })
  closeRoom(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminCloseRoomResultDto> {
    return this.adminService.closePartyRoom(actor.userId, id);
  }

  @Get('rooms')
  @RequireAdminPermission(AdminPermission.ManageRooms)
  @ApiCursorPageQuery()
  @ApiOperation({ summary: 'Danh sách Party Room active + số member thực tế' })
  @ApiOkResponse({ type: AdminRoomsPageDto })
  async listRooms(
    @Query() query: CursorPageQueryDto,
  ): Promise<AdminRoomsPageDto> {
    return AdminRoomsPageDto.from(
      await this.adminService.listPartyRooms(query.limit, query.cursor),
    );
  }

  @Get('support/tickets')
  @RequireAdminPermission(AdminPermission.ManageSupport)
  @ApiCursorPageQuery()
  @ApiOperation({ summary: 'Danh sách yêu cầu hỗ trợ để moderator xử lý' })
  @ApiOkResponse({ type: AdminSupportTicketsPageDto })
  async listSupportTickets(
    @Query() query: AdminListSupportTicketsQueryDto,
  ): Promise<AdminSupportTicketsPageDto> {
    const page = await this.adminService.listSupportTickets(
      query.limit,
      query.cursor,
      query.status,
    );
    return {
      items: page.items.map(SupportTicketDto.from),
      meta: page.meta,
    };
  }

  @Patch('support/tickets/:id')
  @RequireAdminPermission(AdminPermission.ManageSupport)
  @ApiOperation({
    summary: 'Cập nhật trạng thái/phản hồi support — atomic audit log',
  })
  @ApiOkResponse({ type: AdminSupportTicketDto })
  async updateSupportTicket(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AdminUpdateSupportTicketDto,
  ): Promise<AdminSupportTicketDto> {
    return SupportTicketDto.from(
      await this.adminService.updateSupportTicket(actor.userId, id, body),
    );
  }

  @Get('gifts')
  @RequireAdminPermission(AdminPermission.ManageGifts)
  @ApiOperation({
    summary:
      'Toàn bộ catalog quà kể cả đã tắt (khác /gifts công khai chỉ active)',
  })
  @ApiOkResponse({ type: [AdminGiftDto] })
  async listGifts(): Promise<AdminGiftDto[]> {
    return (await this.adminService.listGifts()).map(AdminGiftDto.from);
  }

  @Post('gifts')
  @RequireAdminPermission(AdminPermission.ManageGifts)
  @ApiOperation({ summary: 'Tạo quà mới trong catalog — audit log' })
  @ApiOkResponse({ type: AdminGiftDto })
  async createGift(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: CreateGiftDto,
  ): Promise<AdminGiftDto> {
    return AdminGiftDto.from(
      await this.adminService.createGift(actor.userId, body),
    );
  }

  @Patch('gifts/:id')
  @RequireAdminPermission(AdminPermission.ManageGifts)
  @ApiOperation({
    summary:
      'Sửa giá/tên/thứ tự/bật-tắt quà — audit log, không hard-delete (gift_events tham chiếu FK)',
  })
  @ApiOkResponse({ type: AdminGiftDto })
  async updateGift(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateGiftDto,
  ): Promise<AdminGiftDto> {
    return AdminGiftDto.from(
      await this.adminService.updateGift(actor.userId, id, body),
    );
  }

  @Get('economy/wallet/:userId')
  @RequireAdminPermission(AdminPermission.RefundTransaction)
  @ApiOperation({ summary: 'Ví của user — balance + VIP' })
  @ApiOkResponse({ type: AdminWalletDto })
  async getWallet(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<AdminWalletDto> {
    return AdminWalletDto.from(await this.adminService.getWallet(userId));
  }

  @Get('economy/users/:userId/transactions')
  @RequireAdminPermission(AdminPermission.RefundTransaction)
  @ApiOperation({
    summary:
      'Lịch sử giao dịch của user — cursor pagination, actor-scoped (chưa thấy giao dịch nhận quà)',
  })
  @ApiCursorPageQuery()
  @ApiOkResponse({ type: AdminTransactionsPageDto })
  async listTransactions(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: CursorPageQueryDto,
  ): Promise<AdminTransactionsPageDto> {
    const page = await this.adminService.listTransactions(
      userId,
      query.limit,
      query.cursor,
    );
    return { items: page.items, nextCursor: page.meta.nextCursor };
  }

  @Post('economy/transactions/:id/refund')
  @RequireAdminPermission(AdminPermission.RefundTransaction)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Hoàn tiền thủ công 1 giao dịch — bút toán đảo, audit log, không sửa/xoá giao dịch gốc',
  })
  @ApiOkResponse({ type: RefundResultDto })
  async refundTransaction(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RefundTransactionDto,
  ): Promise<RefundResultDto> {
    return this.adminService.refundTransaction(actor.userId, id, body.reason);
  }

  @Get('config/economy-catalog')
  @RequireAdminPermission(AdminPermission.ManageConfig)
  @ApiOperation({ summary: 'Catalog IAP/VIP gồm cả item inactive — chỉ admin' })
  @ApiOkResponse({ type: AdminEconomyCatalogDto })
  async getEconomyCatalog(): Promise<AdminEconomyCatalogDto> {
    const catalog = await this.adminService.getEconomyCatalog();
    return {
      iapProducts: catalog.iapProducts.map(AdminIapProductDto.from),
      vipPlans: catalog.vipPlans.map(AdminVipPlanDto.from),
    };
  }

  @Patch('config/iap-products/:productId')
  @RequireAdminPermission(AdminPermission.ManageConfig)
  @ApiOperation({ summary: 'Bật/tắt IAP product — chỉ admin, có audit' })
  @ApiOkResponse({ type: AdminIapProductDto })
  async setIapProductActive(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('productId') productId: string,
    @Body() body: SetCatalogActiveDto,
  ): Promise<AdminIapProductDto> {
    return AdminIapProductDto.from(
      await this.adminService.setIapProductActive(
        actor.userId,
        productId,
        body.active,
      ),
    );
  }

  @Patch('config/vip-plans/:id')
  @RequireAdminPermission(AdminPermission.ManageConfig)
  @ApiOperation({ summary: 'Bật/tắt VIP plan — chỉ admin, có audit' })
  @ApiOkResponse({ type: AdminVipPlanDto })
  async setVipPlanActive(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') planId: string,
    @Body() body: SetCatalogActiveDto,
  ): Promise<AdminVipPlanDto> {
    return AdminVipPlanDto.from(
      await this.adminService.setVipPlanActive(
        actor.userId,
        planId,
        body.active,
      ),
    );
  }

  @Post('notifications/broadcast')
  @RequireAdminPermission(AdminPermission.ManageConfig)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Gửi thông báo in-app + push best-effort theo audience — chỉ admin',
  })
  @ApiOkResponse({ type: BroadcastNotificationResultDto })
  broadcastNotification(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() body: BroadcastNotificationDto,
  ): Promise<BroadcastNotificationResultDto> {
    return this.adminService.broadcastNotification(actor.userId, body);
  }

  @Get('permissions')
  @RequireAdminPermission(AdminPermission.ManagePermissions)
  @ApiOperation({
    summary: 'Ma trận quyền role moderator/admin đang enforce thật',
  })
  @ApiOkResponse({ type: AdminPermissionMatrixDto })
  async getPermissionMatrix(): Promise<AdminPermissionMatrixDto> {
    const permissions = await this.adminService.getPermissionMatrix();
    return {
      permissions: permissions.map((permission): AdminRolePermissionDto => ({
        ...permission,
      })),
    };
  }

  @Patch('permissions/:role/:permission')
  @RequireAdminPermission(AdminPermission.ManagePermissions)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Bật/tắt quyền của role — có audit' })
  async setRolePermission(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('role') role: string,
    @Param('permission') permission: string,
    @Body() body: SetRolePermissionDto,
  ): Promise<void> {
    await this.adminService.setRolePermission(
      actor.userId,
      role as Role,
      permission as AdminPermission,
      body.enabled,
    );
  }

  @Get('staff')
  @RequireAdminPermission(AdminPermission.ManagePermissions)
  @ApiOperation({ summary: 'Danh sách user có role moderator/admin' })
  @ApiOkResponse({ type: [AdminStaffDto] })
  async listStaff(): Promise<AdminStaffDto[]> {
    return (await this.adminService.listStaff()).map(AdminStaffDto.from);
  }

  @Patch('staff/:id/role')
  @RequireAdminPermission(AdminPermission.ManagePermissions)
  @ApiOperation({
    summary: 'Đổi/thu hồi role staff — có audit và chặn last-admin',
  })
  @ApiOkResponse({ type: AdminStaffDto })
  async setStaffRole(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetStaffRoleDto,
  ): Promise<AdminStaffDto> {
    return AdminStaffDto.from(
      await this.adminService.setStaffRole(actor.userId, id, body.role),
    );
  }
}
