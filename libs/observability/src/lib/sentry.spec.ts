import * as Sentry from '@sentry/node';

import { initializeSentry } from './sentry';

jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  setTag: jest.fn(),
}));

describe('initializeSentry', () => {
  const originalRequired = process.env['OBSERVABILITY_REQUIRED'];

  afterEach(() => {
    if (originalRequired === undefined) {
      delete process.env['OBSERVABILITY_REQUIRED'];
    } else {
      process.env['OBSERVABILITY_REQUIRED'] = originalRequired;
    }
    jest.clearAllMocks();
  });

  it('cho phép tắt ở dev/CI', () => {
    delete process.env['OBSERVABILITY_REQUIRED'];

    expect(() =>
      initializeSentry({
        dsn: '',
        environment: 'test',
        release: '',
        serviceName: 'core-api',
      }),
    ).not.toThrow();
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('fail boot khi production-like profile thiếu DSN hoặc release', () => {
    process.env['OBSERVABILITY_REQUIRED'] = 'true';

    expect(() =>
      initializeSentry({
        dsn: '',
        environment: 'production',
        release: '',
        serviceName: 'core-api',
      }),
    ).toThrow('Production Sentry is required');
  });
});
