import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

import { PrivacySetting } from '../entities/privacy-setting.entity';

export const DEFAULT_PRIVACY_SETTINGS = {
  showOnlineStatus: true,
  showDistance: true,
  searchableByPhone: false,
  hideProfile: false,
} as const;

export class PrivacySettingsDto {
  @ApiProperty({ default: true })
  showOnlineStatus!: boolean;

  @ApiProperty({ default: true })
  showDistance!: boolean;

  @ApiProperty({ default: false })
  searchableByPhone!: boolean;

  @ApiProperty({ default: false })
  hideProfile!: boolean;

  static from(setting?: PrivacySetting): PrivacySettingsDto {
    const dto = new PrivacySettingsDto();
    dto.showOnlineStatus =
      setting?.showOnlineStatus ?? DEFAULT_PRIVACY_SETTINGS.showOnlineStatus;
    dto.showDistance =
      setting?.showDistance ?? DEFAULT_PRIVACY_SETTINGS.showDistance;
    dto.searchableByPhone =
      setting?.searchableByPhone ?? DEFAULT_PRIVACY_SETTINGS.searchableByPhone;
    dto.hideProfile =
      setting?.hideProfile ?? DEFAULT_PRIVACY_SETTINGS.hideProfile;
    return dto;
  }
}

/** PUT toàn bộ preference để tránh lost-update khi hai toggle gửi đồng thời. */
export class UpdatePrivacySettingsDto {
  @ApiProperty({ default: true })
  @IsBoolean()
  showOnlineStatus!: boolean;

  @ApiProperty({ default: true })
  @IsBoolean()
  showDistance!: boolean;

  @ApiProperty({ default: false })
  @IsBoolean()
  searchableByPhone!: boolean;

  @ApiProperty({ default: false })
  @IsBoolean()
  hideProfile!: boolean;
}

export class UserPresenceDto {
  @ApiProperty({ description: 'Có đang kết nối realtime hay không.' })
  isOnline!: boolean;
}
