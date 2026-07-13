import { canPublishRole } from './api';

describe('canPublishRole', () => {
  it('host và speaker publish được', () => {
    expect(canPublishRole('host')).toBe(true);
    expect(canPublishRole('speaker')).toBe(true);
  });

  it('audience và chưa có role thì không', () => {
    expect(canPublishRole('audience')).toBe(false);
    expect(canPublishRole(undefined)).toBe(false);
  });
});
