import { describe, expect, it } from 'vitest';

import { formatDate, formatNumber } from './formatters';

describe('i18n formatters', () => {
  it('formats numbers according to the selected locale', () => {
    expect(formatNumber(1234567, 'vi')).toBe('1.234.567');
    expect(formatNumber(1234567, 'en')).toBe('1,234,567');
  });

  it('formats dates with a stable product-friendly shape', () => {
    const date = new Date('2026-07-31T00:00:00.000Z');
    expect(formatDate(date, 'vi')).toBe('31/07/2026');
    expect(formatDate(date, 'en')).toBe('07/31/2026');
  });
});
