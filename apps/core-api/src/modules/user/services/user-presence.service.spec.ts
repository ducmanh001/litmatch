import { UserPresenceService } from './user-presence.service';

describe('UserPresenceService', () => {
  it('đọc online qua UserPresenceReaderPort', async () => {
    const presence = { isOnline: jest.fn().mockResolvedValue(true) };
    const service = new UserPresenceService(presence);

    await expect(service.isOnline('u1')).resolves.toBe(true);
    expect(presence.isOnline).toHaveBeenCalledWith('u1');
  });

  it('trả kết quả fail-closed từ UserPresenceReaderPort', async () => {
    const presence = { isOnline: jest.fn().mockResolvedValue(false) };
    const service = new UserPresenceService(presence);

    await expect(service.isOnline('u1')).resolves.toBe(false);
    expect(presence.isOnline).toHaveBeenCalledWith('u1');
  });
});
