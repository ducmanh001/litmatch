import { connect } from 'node:http2';

import { Injectable, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, importPKCS8 } from 'jose';

import type { CoreApiEnv } from '../../config/env.validation';
import { APNS_PRODUCTION_HOST, APNS_SANDBOX_HOST } from './platform.constants';
import {
  PushNotificationPort,
  type PushDeliveryResult,
  type PushNotificationMessage,
} from './push-notification.port';

export interface ApnsTransportMessage {
  token: string;
  type: string;
}

export interface ApnsPushTransport {
  send(message: ApnsTransportMessage): Promise<void>;
}

class ApnsHttp2Transport implements ApnsPushTransport {
  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {}

  async send(message: ApnsTransportMessage): Promise<void> {
    const host =
      this.config.getOrThrow('NOTIFICATION_APNS_ENVIRONMENT', {
        infer: true,
      }) === 'production'
        ? APNS_PRODUCTION_HOST
        : APNS_SANDBOX_HOST;
    const token = await this.createProviderToken();
    const body = JSON.stringify({
      aps: { alert: { title: 'Litmatch', body: 'Bạn có thông báo mới' } },
      notification_type: message.type,
    });
    const url = new URL(host);

    await new Promise<void>((resolve, reject) => {
      const client = connect(url);
      const timeout = setTimeout(
        () => {
          client.destroy();
          reject(new Error('APNs push provider timed out'));
        },
        this.config.getOrThrow('NOTIFICATION_PUSH_HTTP_TIMEOUT_MS', {
          infer: true,
        }),
      );
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        client.close();
        if (error) reject(error);
        else resolve();
      };

      client.once('error', () => finish(new Error('APNs connection failed')));
      const request = client.request({
        ':method': 'POST',
        ':path': `/3/device/${encodeURIComponent(message.token)}`,
        authorization: `bearer ${token}`,
        'apns-topic': this.config.getOrThrow('NOTIFICATION_APNS_BUNDLE_ID', {
          infer: true,
        }),
        'apns-push-type': 'alert',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      });
      let status = 500;
      request.once('response', (headers) => {
        status = Number(headers[':status'] ?? 500);
      });
      request.on('data', () => undefined);
      request.once('error', () => finish(new Error('APNs request failed')));
      request.once('end', () => {
        finish(
          status >= 200 && status < 300
            ? undefined
            : new Error('APNs push provider rejected the request'),
        );
      });
      request.end(body);
    });
  }

  private async createProviderToken(): Promise<string> {
    const key = await importPKCS8(
      this.config
        .getOrThrow('NOTIFICATION_APNS_PRIVATE_KEY', { infer: true })
        .replace(/\\n/g, '\n'),
      'ES256',
    );
    return new SignJWT({})
      .setProtectedHeader({
        alg: 'ES256',
        kid: this.config.getOrThrow('NOTIFICATION_APNS_KEY_ID', {
          infer: true,
        }),
        typ: 'JWT',
      })
      .setIssuer(
        this.config.getOrThrow('NOTIFICATION_APNS_TEAM_ID', { infer: true }),
      )
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);
  }
}

@Injectable()
export class ApnsPushNotificationAdapter
  extends PushNotificationPort
  implements OnApplicationBootstrap
{
  private readonly transport: ApnsPushTransport;

  constructor(
    private readonly config: ConfigService<CoreApiEnv, true>,
    @Optional() transport?: ApnsPushTransport,
  ) {
    super();
    this.transport = transport ?? new ApnsHttp2Transport(this.config);
  }

  onApplicationBootstrap(): void {
    if (
      this.config.getOrThrow('NOTIFICATION_PUSH_PROVIDER', { infer: true }) ===
        'apns' &&
      [
        this.config.getOrThrow('NOTIFICATION_APNS_TEAM_ID', { infer: true }),
        this.config.getOrThrow('NOTIFICATION_APNS_KEY_ID', { infer: true }),
        this.config.getOrThrow('NOTIFICATION_APNS_PRIVATE_KEY', {
          infer: true,
        }),
        this.config.getOrThrow('NOTIFICATION_APNS_BUNDLE_ID', {
          infer: true,
        }),
      ].some((value) => value === '')
    ) {
      throw new Error(
        'NOTIFICATION_PUSH_PROVIDER=apns requires APNs team, key, private key and bundle id configuration',
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
      return { status: 'failed' };
    }
  }
}
