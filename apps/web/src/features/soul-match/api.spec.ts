import { isOpenPhase } from './api';

describe('isOpenPhase', () => {
  it('poll tiếp khi chatting hoặc rating', () => {
    expect(isOpenPhase('chatting')).toBe(true);
    expect(isOpenPhase('rating')).toBe(true);
  });

  it('dừng poll khi closed hoặc chưa có data', () => {
    expect(isOpenPhase('closed')).toBe(false);
    expect(isOpenPhase(undefined)).toBe(false);
  });
});
