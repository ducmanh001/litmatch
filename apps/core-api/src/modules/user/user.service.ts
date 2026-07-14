import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { buildCursorPage } from '@litmatch/common-dtos';
import { DomainException } from '@litmatch/common-exceptions';
import { EntityManager, Repository } from 'typeorm';

import { UserErrors } from './user.errors';
import { Gender, User, UserStatus } from './entities/user.entity';

import type { CursorPage } from '@litmatch/common-dtos';
import type { Role } from '@litmatch/common-dtos';
import type { CoreApiEnv } from '../../config/env.validation';
import type { UpdateProfileDto } from './dto/update-profile.dto';

export interface CreateUserInput {
  nickname: string;
  isGuest: boolean;
}

export interface UserPageFilter {
  status?: UserStatus;
  role?: Role;
  nickname?: string;
}

export interface UserPage {
  items: User[];
  total: number;
}

/** Tiêu chí duyệt user chủ động (Discovery browse, docs/services/discovery-service.md § 2). */
export interface UserBrowseFilter {
  gender?: Gender;
  /** Tuổi tối thiểu (tuổi thật >= ageMin) — server tự quy đổi sang khoảng birthDate. */
  ageMin?: number;
  /** Tuổi tối đa (tuổi thật <= ageMax). */
  ageMax?: number;
  /**
   * Loại trừ khỏi kết quả — caller (Discovery) tự gộp self + hidden set từ Safety trước khi
   * gọi; User module trung lập, không biết khái niệm block/report (docs/05 § 5.3 boundary).
   */
  excludeUserIds?: string[];
  /** Loại guest khỏi kết quả — caller quyết theo config `DISCOVERY_GUEST_VISIBLE`. */
  excludeGuests?: boolean;
}

/** Vị trí keyset đã giải mã — Discovery tự decode/validate cursor (giữ error taxonomy ở đúng module sở hữu). */
export interface UserBrowseCursorPosition {
  createdAt: string;
  id: string;
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

  /** Admin Users List (docs/12 § 12.7) — offset OK vì list nhỏ, không phải lịch sử vô hạn (docs/05 § 5.4). */
  async findPage(
    filter: UserPageFilter,
    limit: number,
    offset: number,
  ): Promise<UserPage> {
    const qb = this.userRepo.createQueryBuilder('u');
    if (filter.status)
      qb.andWhere('u.status = :status', { status: filter.status });
    if (filter.role) qb.andWhere('u.role = :role', { role: filter.role });
    if (filter.nickname) {
      qb.andWhere('u.nickname ILIKE :nickname', {
        nickname: `%${filter.nickname}%`,
      });
    }
    qb.orderBy('u.createdAt', 'DESC').skip(offset).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
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
   * Duyệt user active theo tiêu chí (Discovery browse) — keyset cursor `(createdAt, id)` giảm
   * dần, cùng pattern `economy.service.ts` cho bảng không có cột `seq`. Banned/guest luôn bị
   * loại theo `filter`/status; caller quyết `excludeUserIds` (self + hidden set).
   */
  async browsePage(
    filter: UserBrowseFilter,
    limit: number,
    after?: UserBrowseCursorPosition,
  ): Promise<CursorPage<User>> {
    const qb = this.userRepo
      .createQueryBuilder('u')
      .where('u.status = :status', { status: UserStatus.Active });

    if (filter.gender) {
      qb.andWhere('u.gender = :gender', { gender: filter.gender });
    }
    if (filter.ageMin !== undefined) {
      qb.andWhere('u.birthDate IS NOT NULL AND u.birthDate <= :maxBirthDate', {
        maxBirthDate: this.ageCutoffDate(filter.ageMin),
      });
    }
    if (filter.ageMax !== undefined) {
      qb.andWhere('u.birthDate IS NOT NULL AND u.birthDate > :minBirthDate', {
        minBirthDate: this.ageCutoffDate(filter.ageMax + 1),
      });
    }
    if (filter.excludeUserIds && filter.excludeUserIds.length > 0) {
      qb.andWhere('u.id NOT IN (:...excludeIds)', {
        excludeIds: filter.excludeUserIds,
      });
    }
    if (filter.excludeGuests) {
      qb.andWhere('u.isGuest = false');
    }
    if (after) {
      qb.andWhere('(u.createdAt, u.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: after.createdAt,
        cursorId: after.id,
      });
    }

    const rows = await qb
      .orderBy('u.createdAt', 'DESC')
      .addOrderBy('u.id', 'DESC')
      .take(limit + 1)
      .getMany();
    return buildCursorPage(rows, limit, (last) => ({
      createdAt: last.createdAt.toISOString(),
      id: last.id,
    }));
  }

  /**
   * Duyệt user active theo 1 tập userId cho trước (Nearby — Discovery đã tự lọc candidate qua
   * `user_locations`/`discovery_settings` của chính module Discovery, chỉ cần User module áp
   * lại cùng bộ luật status/gender/age/guest như `browsePage`, không tự chế luật riêng ở
   * Discovery — tránh 2 nơi định nghĩa "user hợp lệ để hiện" khác nhau).
   */
  async findActiveByIds(
    userIds: string[],
    filter: Pick<
      UserBrowseFilter,
      'gender' | 'ageMin' | 'ageMax' | 'excludeGuests'
    >,
  ): Promise<User[]> {
    if (userIds.length === 0) return [];

    const qb = this.userRepo
      .createQueryBuilder('u')
      .where('u.status = :status', { status: UserStatus.Active })
      .andWhere('u.id IN (:...userIds)', { userIds });

    if (filter.gender) {
      qb.andWhere('u.gender = :gender', { gender: filter.gender });
    }
    if (filter.ageMin !== undefined) {
      qb.andWhere('u.birthDate IS NOT NULL AND u.birthDate <= :maxBirthDate', {
        maxBirthDate: this.ageCutoffDate(filter.ageMin),
      });
    }
    if (filter.ageMax !== undefined) {
      qb.andWhere('u.birthDate IS NOT NULL AND u.birthDate > :minBirthDate', {
        minBirthDate: this.ageCutoffDate(filter.ageMax + 1),
      });
    }
    if (filter.excludeGuests) {
      qb.andWhere('u.isGuest = false');
    }

    return qb.getMany();
  }

  /** Ngày cutoff cho "tuổi >= years" — birthDate <= cutoff (cùng công thức `assertBirthDateAllowed`). */
  private ageCutoffDate(years: number): string {
    const now = new Date();
    const cutoff = new Date(
      now.getFullYear() - years,
      now.getMonth(),
      now.getDate(),
    );
    return cutoff.toISOString().slice(0, 10);
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
