import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { EntityManager, Repository } from 'typeorm';

import { UserErrors } from './user.errors';
import { Gender, User, UserStatus } from './entities/user.entity';

import type { CoreApiEnv } from '../../config/env.validation';
import type { UpdateProfileDto } from './dto/update-profile.dto';

export interface CreateUserInput {
  nickname: string;
  isGuest: boolean;
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly config: ConfigService<CoreApiEnv, true>,
  ) {}

  /**
   * Tạo user mới — nhận EntityManager để Auth module gọi trong CÙNG transaction
   * với việc tạo AuthIdentity (tránh user mồ côi khi 1 trong 2 bước fail).
   */
  async createWithManager(
    manager: EntityManager,
    input: CreateUserInput,
  ): Promise<User> {
    const user = manager.create(User, {
      nickname: input.nickname,
      gender: Gender.Unknown,
      avatarId: this.config.getOrThrow('USER_DEFAULT_AVATAR_ID', {
        infer: true,
      }),
      isGuest: input.isGuest,
      status: UserStatus.Active,
    });
    return manager.save(user);
  }

  async getByIdOrThrow(id: string): Promise<User> {
    const user = await this.userRepo.findOneBy({ id });
    if (!user) {
      throw new DomainException(
        UserErrors.PROFILE_NOT_FOUND,
        'Không tìm thấy user',
        HttpStatus.NOT_FOUND,
      );
    }
    return user;
  }

  /**
   * Sửa trust score atomic, clamp ở sàn `floor` (không CHECK ở DB — cùng tinh thần Wallet:
   * guard tầng ứng dụng, docs/services/safety-service.md § 4). Nhận `manager` để Safety module
   * gọi trong CÙNG transaction với `Report`/`Block` (tránh lệch khi 1 bước fail giữa chừng).
   */
  async adjustTrustScore(
    manager: EntityManager,
    userId: string,
    delta: number,
    floor: number,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(User)
      .set({ trustScore: () => 'GREATEST(:floor, trust_score + :delta)' })
      .where('id = :id')
      .setParameters({ id: userId, floor, delta })
      .execute();
  }

  /**
   * Nhận `manager` để AdminModule ghi CÙNG transaction với audit log (atomic — hành động
   * nhạy cảm không được thành công 1 nửa: đổi status mà audit fail hoặc ngược lại).
   */
  async banUser(manager: EntityManager, userId: string): Promise<User> {
    return this.setStatus(manager, userId, UserStatus.Banned);
  }

  async unbanUser(manager: EntityManager, userId: string): Promise<User> {
    return this.setStatus(manager, userId, UserStatus.Active);
  }

  private async setStatus(
    manager: EntityManager,
    userId: string,
    status: UserStatus,
  ): Promise<User> {
    const repo = manager.getRepository(User);
    const user = await repo.findOneBy({ id: userId });
    if (!user) {
      throw new DomainException(
        UserErrors.PROFILE_NOT_FOUND,
        'Không tìm thấy user',
        HttpStatus.NOT_FOUND,
      );
    }
    user.status = status;
    return repo.save(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.getByIdOrThrow(userId);

    if (dto.birthDate !== undefined) {
      this.assertBirthDateAllowed(dto.birthDate);
      user.birthDate = dto.birthDate;
    }
    if (dto.nickname !== undefined) user.nickname = dto.nickname;
    if (dto.gender !== undefined) user.gender = dto.gender;
    if (dto.region !== undefined) user.region = dto.region;

    return this.userRepo.save(user);
  }

  /**
   * Tuổi tối thiểu enforce ở server (docs/06) — không tin FE.
   * Giả định (docs/10 § 10.0): user có thể gửi birthDate tương lai hoặc < minAge → chặn cả 2.
   */
  private assertBirthDateAllowed(birthDate: string): void {
    const minAge = this.config.getOrThrow('AUTH_MIN_AGE', { infer: true });
    const parsed = new Date(birthDate);
    const now = new Date();
    if (Number.isNaN(parsed.getTime()) || parsed > now) {
      throw new DomainException(
        UserErrors.PROFILE_BIRTH_DATE_INVALID,
        'Ngày sinh không hợp lệ',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const cutoff = new Date(
      now.getFullYear() - minAge,
      now.getMonth(),
      now.getDate(),
    );
    if (parsed > cutoff) {
      throw new DomainException(
        UserErrors.PROFILE_AGE_BELOW_MINIMUM,
        `Phải đủ ${minAge} tuổi để sử dụng dịch vụ`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { minAge },
      );
    }
  }
}
