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

import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/**
 * Task 0 backend (docs/12 § 12.7) — endpoint tối thiểu chứng minh guard chain RBAC + audit
 * log hoạt động thật. @RequireRoles ở CLASS level: mọi route thêm sau trong controller này
 * tự động bị chặn, không cần nhớ khai lại per-route (docs/10 § "guard route bị coi là chốt
 * chặn thật").
 */
@ApiTags('admin')
@ApiBearerAuth()
@RequireRoles(Roles.Admin, Roles.Moderator)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
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
  @ApiOperation({
    summary: 'Xem profile nội bộ user (status + role) — chỉ admin/moderator',
  })
  @ApiOkResponse({ type: AdminUserDto })
  async getUser(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserDto> {
    return AdminUserDto.from(await this.adminService.getUser(id));
  }

  @Post('users/:id/ban')
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

  @Get('gifts')
  @ApiOperation({
    summary:
      'Toàn bộ catalog quà kể cả đã tắt (khác /gifts công khai chỉ active)',
  })
  @ApiOkResponse({ type: [AdminGiftDto] })
  async listGifts(): Promise<AdminGiftDto[]> {
    return (await this.adminService.listGifts()).map(AdminGiftDto.from);
  }

  @Post('gifts')
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
  @ApiOperation({ summary: 'Ví của user — balance + VIP' })
  @ApiOkResponse({ type: AdminWalletDto })
  async getWallet(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<AdminWalletDto> {
    return AdminWalletDto.from(await this.adminService.getWallet(userId));
  }

  @Get('economy/users/:userId/transactions')
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
}
