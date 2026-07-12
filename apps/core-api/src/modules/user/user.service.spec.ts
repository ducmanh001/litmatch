import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';

import { UserService } from './user.service';
import { UserErrors } from './user.errors';
import { Gender, User, UserStatus } from './entities/user.entity';

describe('UserService', () => {
  const repo = {
    findOneBy: jest.fn(),
    save: jest.fn((u: User) => Promise.resolve(u)),
  };
  const config = {
    getOrThrow: jest.fn(
      (key: string) =>
        ({ AUTH_MIN_AGE: 18, USER_DEFAULT_AVATAR_ID: 'default-01' })[key],
    ),
  };
  let service: UserService;

  const activeUser = (): User =>
    Object.assign(new User(), {
      id: 'u1',
      nickname: 'A',
      gender: Gender.Unknown,
      birthDate: null,
      region: null,
      avatarId: 'default-01',
      trustScore: 100,
      status: UserStatus.Active,
      isGuest: false,
    });

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useValue: repo },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(UserService);
  });

  it('cập nhật profile hợp lệ', async () => {
    repo.findOneBy.mockResolvedValue(activeUser());
    const updated = await service.updateProfile('u1', {
      nickname: 'Mưa Đêm',
      birthDate: '1995-05-20',
    });
    expect(updated.nickname).toBe('Mưa Đêm');
    expect(updated.birthDate).toBe('1995-05-20');
  });

  it('chặn birthDate dưới tuổi tối thiểu — rule enforce ở server, không tin FE (docs/06)', async () => {
    repo.findOneBy.mockResolvedValue(activeUser());
    const recent = new Date();
    recent.setFullYear(recent.getFullYear() - 15);
    await expect(
      service.updateProfile('u1', {
        birthDate: recent.toISOString().slice(0, 10),
      }),
    ).rejects.toMatchObject({
      code: UserErrors.PROFILE_AGE_BELOW_MINIMUM,
      httpStatus: 422,
    });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('chặn birthDate ở tương lai', async () => {
    repo.findOneBy.mockResolvedValue(activeUser());
    await expect(
      service.updateProfile('u1', { birthDate: '2999-01-01' }),
    ).rejects.toMatchObject({
      code: UserErrors.PROFILE_BIRTH_DATE_INVALID,
    });
  });

  it('user không tồn tại → 404 domain error', async () => {
    repo.findOneBy.mockResolvedValue(null);
    await expect(service.getByIdOrThrow('nope')).rejects.toBeInstanceOf(
      DomainException,
    );
  });
});
