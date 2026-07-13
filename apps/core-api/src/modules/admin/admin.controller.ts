import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '@litmatch/common-dtos';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireRoles } from '../../common/decorators/roles.decorator';

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
}
