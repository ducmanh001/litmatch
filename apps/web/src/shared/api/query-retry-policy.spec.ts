import { shouldRetryQuery } from './query-retry-policy';

function apiError(status: number): { status: number } {
  return { status };
}

describe('shouldRetryQuery', () => {
  it('retries one transient or network failure', () => {
    expect(shouldRetryQuery(0, apiError(0))).toBe(true);
    expect(shouldRetryQuery(0, apiError(503))).toBe(true);
  });

  it('does not retry permanent client errors or exceed one retry', () => {
    expect(shouldRetryQuery(0, new Error('deterministic query failure'))).toBe(
      false,
    );
    expect(shouldRetryQuery(0, apiError(400))).toBe(false);
    expect(shouldRetryQuery(0, apiError(404))).toBe(false);
    expect(shouldRetryQuery(0, apiError(429))).toBe(false);
    expect(shouldRetryQuery(1, apiError(0))).toBe(false);
  });
});
