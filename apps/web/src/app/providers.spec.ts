import { createQueryClient } from './providers';

describe('createQueryClient', () => {
  it('lets socket reconnect own resync and keeps polling out of background tabs', () => {
    const queries = createQueryClient().getDefaultOptions().queries;

    expect(queries).toMatchObject({
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      refetchIntervalInBackground: false,
    });

    expect(typeof queries.refetchOnReconnect).toBe('function');

    expect(typeof queries.retry).toBe('function');
    if (typeof queries.retry === 'function') {
      expect(queries.retry(0, { status: 404 })).toBe(false);
      expect(queries.retry(0, { status: 503 })).toBe(true);
    }
  });
});
