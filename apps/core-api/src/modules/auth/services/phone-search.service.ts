import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';

import {
  PrivacySettingsService,
  PublicProfileDto,
  UserService,
  UserStatus,
} from '../../user';
import { AuthIdentity, AuthProvider } from '../entities/auth-identity.entity';

@Injectable()
export class PhoneSearchService {
  constructor(
    @InjectRepository(AuthIdentity)
    private readonly identityRepo: Repository<AuthIdentity>,
    private readonly userService: UserService,
    private readonly privacySettings: PrivacySettingsService,
  ) {}

  /** Privacy-off và identity không tồn tại cùng trả null để không tạo oracle. */
  async search(phone: string): Promise<PublicProfileDto | null> {
    const identity = await this.identityRepo.findOne({
      where: { provider: AuthProvider.Phone, providerUid: phone },
    });
    if (!identity) return null;
    if (!(await this.privacySettings.isSearchableByPhone(identity.userId))) {
      return null;
    }

    const user = await this.userService.getByIdOrThrow(identity.userId);
    if (user.status !== UserStatus.Active) return null;
    return PublicProfileDto.from(user);
  }
}
