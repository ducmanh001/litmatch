import { HttpStatus } from '@nestjs/common';

import { AuthProvider } from '../entities/auth-identity.entity';
import { SocialVerifierService } from './social-verifier';

import type { CoreApiEnv } from '../../../config/env.validation';
import type { ConfigService } from '@nestjs/config';

describe('SocialVerifierService Facebook', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function createService(): SocialVerifierService {
    const values: Pick<
      CoreApiEnv,
      'AUTH_FACEBOOK_APP_ID' | 'AUTH_FACEBOOK_APP_SECRET'
    > = {
      AUTH_FACEBOOK_APP_ID: 'facebook-app-id',
      AUTH_FACEBOOK_APP_SECRET: 'facebook-app-secret',
    };
    const config = {
      getOrThrow: jest.fn((key: keyof typeof values) => values[key]),
    } as unknown as ConfigService<CoreApiEnv, true>;
    return new SocialVerifierService(config);
  }

  it('only accepts a valid access token belonging to the configured Facebook app', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          app_id: 'facebook-app-id',
          is_valid: true,
          user_id: 'facebook-user-id',
        },
      }),
    });
    global.fetch = fetchMock as typeof fetch;

    await expect(
      createService().verify(AuthProvider.Facebook, 'client-access-token'),
    ).resolves.toEqual({ uid: 'facebook-user-id' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: expect.stringContaining('input_token=client-access-token'),
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('fails closed when Facebook returns a token for a different app', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          app_id: 'another-app',
          is_valid: true,
          user_id: 'facebook-user-id',
        },
      }),
    }) as typeof fetch;

    await expect(
      createService().verify(AuthProvider.Facebook, 'client-access-token'),
    ).rejects.toMatchObject({
      httpStatus: HttpStatus.UNAUTHORIZED,
    });
  });
});
