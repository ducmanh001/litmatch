import { joinQueueSchema } from './join-queue-schema';

describe('joinQueueSchema', () => {
  it('chấp nhận matchType/genderPreference hợp lệ', () => {
    const result = joinQueueSchema.parse({
      matchType: 'voice',
      genderPreference: 'female',
    });
    expect(result).toEqual({ matchType: 'voice', genderPreference: 'female' });
  });

  it('từ chối matchType không thuộc enum', () => {
    expect(() => joinQueueSchema.parse({ matchType: 'unknown' })).toThrow();
  });

  it('từ chối genderPreference không thuộc enum', () => {
    expect(() =>
      joinQueueSchema.parse({ matchType: 'soul', genderPreference: 'x' }),
    ).toThrow();
  });
});
