import { ApiProperty } from '@nestjs/swagger';

export class AdminDailyDiamondDto {
  @ApiProperty({ example: '2026-07-15' }) date!: string;
  @ApiProperty({ example: '1200' }) amount!: string;
}

export class AdminUserTierDistributionDto {
  @ApiProperty() free!: number;
  @ApiProperty() vip!: number;
  @ApiProperty() svip!: number;
}

export class AdminActivityDto {
  @ApiProperty() id!: string;
  @ApiProperty() actorUserId!: string;
  @ApiProperty() actorNickname!: string;
  @ApiProperty() action!: string;
  @ApiProperty() targetType!: string;
  @ApiProperty() targetId!: string;
  @ApiProperty() createdAt!: Date;
}

export class AdminDashboardDto {
  @ApiProperty() newUsersToday!: number;
  @ApiProperty() newUsersPreviousDay!: number;
  @ApiProperty() activeUsers!: number;
  @ApiProperty() activeRoomCount!: number;
  @ApiProperty() totalDiamondSpentSevenDays!: string;
  @ApiProperty({ type: [AdminDailyDiamondDto] })
  dailyDiamondSpent!: AdminDailyDiamondDto[];
  @ApiProperty({ type: AdminUserTierDistributionDto })
  userTiers!: AdminUserTierDistributionDto;
  @ApiProperty({ type: [AdminActivityDto] })
  recentActivities!: AdminActivityDto[];
}
