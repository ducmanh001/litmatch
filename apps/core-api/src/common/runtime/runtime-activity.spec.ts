import {
  getRuntimeActivitySnapshot,
  isRuntimeActive,
  markRuntimeActivity,
  recordRuntimeBackgroundSkip,
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
    expect(getRuntimeActivitySnapshot(2_000)).toMatchObject({
      mode: 'active',
      meaningfulRequestCount: 1,
      backgroundSkipCount: 0,
    });
  });

  it('returns to idle after the activity window', () => {
    markRuntimeActivity('/api/v1/home', 10_000);

    expect(isRuntimeActive(10_000 + 5 * 60 * 1_000)).toBe(true);
    expect(isRuntimeActive(10_000 + 5 * 60 * 1_000 + 1)).toBe(false);
  });

  it('counts idle backstop skips for operations evidence', () => {
    recordRuntimeBackgroundSkip('matching-matcher');
    recordRuntimeBackgroundSkip('feed-story-sweeper');

    expect(getRuntimeActivitySnapshot()).toMatchObject({
      mode: 'idle',
      meaningfulRequestCount: 0,
      backgroundSkipCount: 2,
    });
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
