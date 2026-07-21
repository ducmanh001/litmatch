import { formatMinutesSeconds } from './format-minutes-seconds';

describe('formatMinutesSeconds', () => {
  it.each([
    [-1, '0:00'],
    [0, '0:00'],
    [9.9, '0:09'],
    [65, '1:05'],
    [3_661, '61:01'],
  ])('format %s giây thành %s', (seconds, expected) => {
    expect(formatMinutesSeconds(seconds)).toBe(expected);
  });
});
