import { PhoneSearchService } from './phone-search.service';
import { Gender, UserStatus } from '../../user';

describe('PhoneSearchService', () => {
  const identityRepo = { findOne: jest.fn() };
  const userService = { getByIdOrThrow: jest.fn() };
  const privacySettings = { isSearchableByPhone: jest.fn() };
  const service = new PhoneSearchService(
    identityRepo as never,
    userService as never,
    privacySettings as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('không có identity → null, không hỏi privacy', async () => {
    identityRepo.findOne.mockResolvedValue(null);

    await expect(service.search('+84912345678')).resolves.toBeNull();
    expect(privacySettings.isSearchableByPhone).not.toHaveBeenCalled();
  });

  it('tắt searchable → null giống hệt số không tồn tại', async () => {
    identityRepo.findOne.mockResolvedValue({ userId: 'u1' });
    privacySettings.isSearchableByPhone.mockResolvedValue(false);

    await expect(service.search('+84912345678')).resolves.toBeNull();
    expect(userService.getByIdOrThrow).not.toHaveBeenCalled();
  });

  it('bật searchable + active → trả PublicProfile tối thiểu', async () => {
    identityRepo.findOne.mockResolvedValue({ userId: 'u1' });
    privacySettings.isSearchableByPhone.mockResolvedValue(true);
    userService.getByIdOrThrow.mockResolvedValue({
      id: 'u1',
      nickname: 'A',
      gender: Gender.Female,
      avatarId: 'a1',
      interests: ['Cà phê'],
      status: UserStatus.Active,
    });

    await expect(service.search('+84912345678')).resolves.toMatchObject({
      id: 'u1',
      nickname: 'A',
      interests: ['Cà phê'],
    });
  });
});
