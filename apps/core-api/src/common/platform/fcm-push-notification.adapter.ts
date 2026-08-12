import { Injectable, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, importPKCS8 } from 'jose';

import type { CoreApiEnv } from '../../config/env.validation';
import {
  FCM_API_BASE_URL,
  FCM_MESSAGING_SCOPE,
  FCM_OAUTH_TOKEN_URL,
} from './platform.constants';
import {
  PushNotificationPort,
  type PushDeliveryResult,
  type PushNotificationMessage,
} from './push-notification.port';

export interface FcmTransportMessage {
  token: string;
  type: string;
}

export interface FcmPushTransport {
  send(message: FcmTransportMessage): Promise<void>;
}

class FcmHttpTransport implements FcmPushTransport {
  private accessToken: { value: string; expiresAt: number } | undefined;

  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {}

  async send(message: FcmTransportMessage): Promise<void> {
    const projectId = this.config.getOrThrow('NOTIFICATION_FCM_PROJECT_ID', {
      infer: true,
    });
    const accessToken = await this.getAccessToken();
    const response = await fetch(
      `${FCM_API_BASE_URL}/${encodeURIComponent(projectId)}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: message.token,
            data: { notification_type: message.type },
          },
        }),
        signal: AbortSignal.timeout(
          this.config.getOrThrow('NOTIFICATION_PUSH_HTTP_TIMEOUT_MS', {
            infer: true,
          }),
        ),
      },
    );
    if (!response.ok) {
      throw new Error('FCM push provider rejected the request');
    }
  }

  private async getAccessToken(): Promise<string> {
    if (
      this.accessToken !== undefined &&
      this.accessToken.expiresAt > Date.now() + 60_000
    ) {
      return this.accessToken.value;
    }

    const email = this.config.getOrThrow('NOTIFICATION_FCM_CLIENT_EMAIL', {
      infer: true,
    });
    const privateKeyPem = this.config
      .getOrThrow('NOTIFICATION_FCM_PRIVATE_KEY', { infer: true })
      .replace(/\\n/g, '\n');
    const key = await importPKCS8(privateKeyPem, 'RS256');
    const assertion = await new SignJWT({ scope: FCM_MESSAGING_SCOPE })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(email)
      .setAudience(FCM_OAUTH_TOKEN_URL)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key);
    const response = await fetch(FCM_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: AbortSignal.timeout(
        this.config.getOrThrow('NOTIFICATION_PUSH_HTTP_TIMEOUT_MS', {
          infer: true,
        }),
      ),
    });
    if (!response.ok)
      throw new Error('FCM OAuth provider rejected the request');
    const body = (await response.json()) as {
      access_token?: unknown;
      expires_in?: unknown;
    };
    if (typeof body.access_token !== 'string' || body.access_token === '') {
      throw new Error('FCM OAuth response did not include an access token');
    }
    const expiresIn =
      typeof body.expires_in === 'number' && body.expires_in > 0
        ? body.expires_in
        : 3600;
    this.accessToken = {
      value: body.access_token,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    return body.access_token;
  }
}

@Injectable()
export class FcmPushNotificationAdapter
  extends PushNotificationPort
  implements OnApplicationBootstrap
{
  private readonly transport: FcmPushTransport;

  constructor(
    private readonly config: ConfigService<CoreApiEnv, true>,
    @Optional() transport?: FcmPushTransport,
  ) {
    super();
    this.transport = transport ?? new FcmHttpTransport(this.config);
  }

  onApplicationBootstrap(): void {
    if (
      this.config.getOrThrow('NOTIFICATION_PUSH_PROVIDER', { infer: true }) ===
        'fcm' &&
      [
        this.config.getOrThrow('NOTIFICATION_FCM_PROJECT_ID', { infer: true }),
        this.config.getOrThrow('NOTIFICATION_FCM_CLIENT_EMAIL', {
          infer: true,
        }),
        this.config.getOrThrow('NOTIFICATION_FCM_PRIVATE_KEY', {
          infer: true,
        }),
      ].some((value) => value === '')
    ) {
      throw new Error(
        'NOTIFICATION_PUSH_PROVIDER=fcm requires NOTIFICATION_FCM_PROJECT_ID, NOTIFICATION_FCM_CLIENT_EMAIL and NOTIFICATION_FCM_PRIVATE_KEY',
      );
    }
  }

  async send(message: PushNotificationMessage): Promise<PushDeliveryResult> {
    if (message.deviceToken === undefined || message.deviceToken === '') {
      return { status: 'skipped' };
    }
    try {
      await this.transport.send({
        token: message.deviceToken,
        type: message.type,
      });
      return { status: 'delivered' };
    } catch {
      // The caller keeps the in-app row; no provider error can break its transaction.
      return { status: 'failed' };
    }
  }
}
