import {
  canPublishRole,
  isActiveRoomStatus,
  partyRoomRefetchInterval,
  PARTY_ROOM_HEALTHY_REFETCH_INTERVAL_MS,
  PARTY_ROOM_DETAIL_REFETCH_INTERVAL_MS,
} from './api';

describe('canPublishRole', () => {
  it('dùng fallback 5 giây cho room detail', () => {
    expect(PARTY_ROOM_DETAIL_REFETCH_INTERVAL_MS).toBe(5_000);
  });

  it('host và speaker publish được', () => {
    expect(canPublishRole('host')).toBe(true);
    expect(canPublishRole('speaker')).toBe(true);
  });

  it('audience và chưa có role thì không', () => {
    expect(canPublishRole('audience')).toBe(false);
    expect(canPublishRole(undefined)).toBe(false);
  });

  it('dừng fallback poll khi room đã closed hoặc chưa có dữ liệu', () => {
    expect(isActiveRoomStatus('active')).toBe(true);
    expect(isActiveRoomStatus('closed')).toBe(false);
    expect(isActiveRoomStatus(undefined)).toBe(false);
  });

  it('poll chậm khi realtime khỏe, poll sát khi socket mất', () => {
    expect(partyRoomRefetchInterval('active', true)).toBe(
      PARTY_ROOM_HEALTHY_REFETCH_INTERVAL_MS,
    );
    expect(partyRoomRefetchInterval('active', false)).toBe(
      PARTY_ROOM_DETAIL_REFETCH_INTERVAL_MS,
    );
    expect(partyRoomRefetchInterval('closed', false)).toBe(false);
  });
});
