import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { In, Repository } from 'typeorm';

import {
  DEFAULT_PRIVACY_SETTINGS,
  PrivacySettingsDto,
  UpdatePrivacySettingsDto,
} from '../dto/privacy-setting.dto';
import { PrivacySetting } from '../entities/privacy-setting.entity';

@Injectable()
export class PrivacySettingsService {
  constructor(
    @InjectRepository(PrivacySetting)
    private readonly settingRepo: Repository<PrivacySetting>,
  ) {}

  async getForUser(userId: string): Promise<PrivacySettingsDto> {
    return PrivacySettingsDto.from(
      (await this.settingRepo.findOneBy({ userId })) ?? undefined,
    );
  }

  async updateForUser(
    userId: string,
    dto: UpdatePrivacySettingsDto,
  ): Promise<PrivacySettingsDto> {
    await this.settingRepo.upsert(
      {
        userId,
        ...DEFAULT_PRIVACY_SETTINGS,
        ...dto,
      },
      ['userId'],
    );
    return this.getForUser(userId);
  }

  async findForUsers(
    userIds: readonly string[],
  ): Promise<ReadonlyMap<string, PrivacySettingsDto>> {
    const uniqueIds = [...new Set(userIds)];
    if (uniqueIds.length === 0) return new Map();
    const rows = await this.settingRepo.find({
      where: { userId: In(uniqueIds) },
    });
    const settings = new Map<string, PrivacySettingsDto>();
    for (const userId of uniqueIds) {
      settings.set(userId, PrivacySettingsDto.from());
    }
    for (const row of rows) {
      settings.set(row.userId, PrivacySettingsDto.from(row));
    }
    return settings;
  }

  async isSearchableByPhone(userId: string): Promise<boolean> {
    const settings = await this.getForUser(userId);
    return settings.searchableByPhone;
  }

  async isHidden(userId: string): Promise<boolean> {
    const settings = await this.getForUser(userId);
    return settings.hideProfile;
  }
}
