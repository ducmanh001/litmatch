import {
  isRuntimeActive,
  markRuntimeActivity,
  resetRuntimeActivity,
} from './runtime-activity';

describe('runtime activity', () => {
  afterEach(() => resetRuntimeActivity());

  it('starts idle until meaningful API traffic arrives', () => {
    expect(isRuntimeActive(1_000)).toBe(false);

    markRuntimeActivity('/health/ready', 1_000);
    expect(isRuntimeActive(1_000)).toBe(false);

    markRuntimeActivity('/api/v1/matching/tickets', 2_000);
    expect(isRuntimeActive(2_000)).toBe(true);
  });

  it('returns to idle after the activity window', () => {
    markRuntimeActivity('/api/v1/home', 10_000);

    expect(isRuntimeActive(10_000 + 5 * 60 * 1_000)).toBe(true);
    expect(isRuntimeActive(10_000 + 5 * 60 * 1_000 + 1)).toBe(false);
  });

  it('ignores health, metrics, and swagger probes', () => {
    for (const path of [
      '/health',
      '/api/v1/health/ready',
      '/metrics',
      '/api/v1/metrics',
      '/swagger',
    ]) {
      markRuntimeActivity(path, 1_000);
    }

    expect(isRuntimeActive(1_000)).toBe(false);
  });
});
