import { isActiveCallStatus } from './api';

describe('isActiveCallStatus', () => {
  it('poll tiếp khi pending hoặc active', () => {
    expect(isActiveCallStatus('pending')).toBe(true);
    expect(isActiveCallStatus('active')).toBe(true);
  });

  it('dừng poll khi ended hoặc chưa có data', () => {
    expect(isActiveCallStatus('ended')).toBe(false);
    expect(isActiveCallStatus(undefined)).toBe(false);
  });
});
