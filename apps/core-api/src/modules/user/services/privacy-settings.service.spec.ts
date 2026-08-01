import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';

import { PrivacySettingsService } from './privacy-settings.service';
import { PrivacySetting } from '../entities/privacy-setting.entity';

describe('PrivacySettingsService', () => {
  const repo = {
    findOneBy: jest.fn(),
    find: jest.fn(),
    upsert: jest.fn(),
  };
  let service: PrivacySettingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrivacySettingsService,
        { provide: getRepositoryToken(PrivacySetting), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(PrivacySettingsService);
  });

  it('user chưa có row → trả default an toàn', async () => {
    repo.findOneBy.mockResolvedValue(null);

    await expect(service.getForUser('u1')).resolves.toEqual({
      showOnlineStatus: true,
      showDistance: true,
      searchableByPhone: false,
      hideProfile: false,
    });
  });

  it('update dùng upsert unique userId rồi đọc lại server state', async () => {
    repo.findOneBy.mockResolvedValue({
      userId: 'u1',
      showOnlineStatus: false,
      showDistance: false,
      searchableByPhone: true,
      hideProfile: true,
    });

    await expect(
      service.updateForUser('u1', {
        showOnlineStatus: false,
        showDistance: false,
        searchableByPhone: true,
        hideProfile: true,
      }),
    ).resolves.toEqual({
      showOnlineStatus: false,
      showDistance: false,
      searchableByPhone: true,
      hideProfile: true,
    });
    expect(repo.upsert).toHaveBeenCalledWith(
      {
        userId: 'u1',
        showOnlineStatus: false,
        showDistance: false,
        searchableByPhone: true,
        hideProfile: true,
      },
      ['userId'],
    );
  });

  it('findForUsers trả default cho user cũ chưa có row và dedupe id', async () => {
    repo.find.mockResolvedValue([
      {
        userId: 'u2',
        showOnlineStatus: false,
        showDistance: true,
        searchableByPhone: false,
        hideProfile: true,
      },
    ]);

    const settings = await service.findForUsers(['u1', 'u1', 'u2']);

    expect(repo.find).toHaveBeenCalledWith({
      where: { userId: expect.anything() },
    });
    expect(settings.get('u1')).toEqual({
      showOnlineStatus: true,
      showDistance: true,
      searchableByPhone: false,
      hideProfile: false,
    });
    expect(settings.get('u2')?.hideProfile).toBe(true);
  });
});
