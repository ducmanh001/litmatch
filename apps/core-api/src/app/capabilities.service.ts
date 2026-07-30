import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  parseMaintenanceCapabilities,
  type CapabilityId,
} from '../config/capabilities';

import type { CoreApiEnv } from '../config/env.validation';
import {
  AuthProviderCapabilityDto,
  CapabilitiesDto,
  CapabilityStateDto,
  CapabilityStatus,
} from './capabilities.dto';

@Injectable()
export class CapabilitiesService {
  private readonly maintenance: Set<CapabilityId>;

  constructor(private readonly config: ConfigService<CoreApiEnv, true>) {
    this.maintenance = parseMaintenanceCapabilities(
      this.config.getOrThrow('CAPABILITY_MAINTENANCE_FEATURES', {
        infer: true,
      }),
    );
  }

  getCapabilities(): CapabilitiesDto {
    const production =
      this.config.getOrThrow('NODE_ENV', { infer: true }) === 'production';
    const googleClientId = this.value('AUTH_GOOGLE_CLIENT_ID');
    const appleClientId = this.value('AUTH_APPLE_CLIENT_ID');
    const facebookAppId = this.value('AUTH_FACEBOOK_APP_ID');
    const facebookReady =
      facebookAppId !== '' && this.value('AUTH_FACEBOOK_APP_SECRET') !== '';
    const payosCredentialsReady = [
      'PAYOS_CLIENT_ID',
      'PAYOS_API_KEY',
      'PAYOS_CHECKSUM_KEY',
    ].every((key) => this.value(key as keyof CoreApiEnv) !== '');
    const payosRedirectReady =
      this.value('PAYOS_WEB_WALLET_URL') !== '' ||
      (this.value('PAYOS_RETURN_URL') !== '' &&
        this.value('PAYOS_CANCEL_URL') !== '');
    const payosReady = payosCredentialsReady && payosRedirectReady;
    const iapVerifier = this.config.getOrThrow('ECONOMY_IAP_VERIFIER', {
      infer: true,
    });
    const appleIapReady = this.value('ECONOMY_APPLE_SHARED_SECRET') !== '';
    const googleIapReady = [
      'ECONOMY_GOOGLE_PACKAGE_NAME',
      'ECONOMY_GOOGLE_SA_EMAIL',
      'ECONOMY_GOOGLE_SA_PRIVATE_KEY',
    ].every((key) => this.value(key as keyof CoreApiEnv) !== '');
    const nativeIapProviders = [
      appleIapReady ? 'Apple' : null,
      googleIapReady ? 'Google' : null,
    ].filter((provider): provider is string => provider !== null);
    const videoEnabled = this.config.getOrThrow('VIDEO_UPLOAD_ENABLED', {
      infer: true,
    });
    const pushProvider = this.config.getOrThrow('NOTIFICATION_PUSH_PROVIDER', {
      infer: true,
    });
    const nativeApple = this.nativeIapProvider(
      iapVerifier,
      appleIapReady,
      production,
      'Apple',
    );
    const nativeGoogle = this.nativeIapProvider(
      iapVerifier,
      googleIapReady,
      production,
      'Google',
    );
    const native = this.withMaintenance(
      'topUp.native',
      iapVerifier === 'dev' && !production
        ? this.state(
            CapabilityStatus.Beta,
            'IAP chỉ dùng verifier phát triển, không phải giao dịch thật.',
          )
        : nativeApple.status === CapabilityStatus.Enabled &&
            nativeGoogle.status === CapabilityStatus.Enabled
          ? this.state(
              CapabilityStatus.Enabled,
              'Apple và Google native IAP đều sẵn sàng.',
            )
          : this.state(
              CapabilityStatus.Disabled,
              nativeIapProviders.length > 0
                ? `Native IAP mới chỉ cấu hình ${nativeIapProviders.join('/')}; client phải dùng trạng thái theo provider.`
                : 'Nạp qua native IAP chưa được hỗ trợ trên môi trường này.',
            ),
    );
    return {
      auth: {
        phoneOtp: this.phoneOtpCapability(production),
        google: this.authProvider(
          'auth.google',
          googleClientId !== '',
          googleClientId,
          'Đăng nhập Google chưa được cấu hình.',
        ),
        apple: this.authProvider(
          'auth.apple',
          appleClientId !== '',
          appleClientId,
          'Đăng nhập Apple chưa được cấu hình.',
        ),
        facebook: this.authProvider(
          'auth.facebook',
          facebookReady,
          facebookReady ? facebookAppId : '',
          'Đăng nhập Facebook chưa được cấu hình đầy đủ.',
        ),
        guest: this.state(
          CapabilityStatus.Enabled,
          'Có thể dùng tài khoản khách.',
        ),
      },
      topUp: {
        web: this.withMaintenance(
          'topUp.web',
          payosReady
            ? this.state(
                CapabilityStatus.Enabled,
                'Nạp qua chuyển khoản/VietQR payOS.',
              )
            : this.state(
                CapabilityStatus.Disabled,
                'Nạp qua web chưa được cấu hình.',
              ),
        ),
        native,
        nativeApple: this.withMaintenance('topUp.native', nativeApple),
        nativeGoogle: this.withMaintenance('topUp.native', nativeGoogle),
      },
      video: {
        upload: this.devOnlyCapability(
          'video.upload',
          videoEnabled,
          production,
          'Upload video chỉ đang nối storage phát triển.',
        ),
        transcode: this.devOnlyCapability(
          'video.transcode',
          videoEnabled,
          production,
          'Transcode video chỉ đang nối provider phát triển.',
        ),
      },
      notifications: {
        push: this.withMaintenance(
          'notifications.push',
          pushProvider === 'dev' && !production
            ? this.state(
                CapabilityStatus.Beta,
                'Push đang dùng provider phát triển và không gửi ra thiết bị thật.',
              )
            : this.state(
                CapabilityStatus.Disabled,
                'Push notification chưa được cấu hình.',
              ),
        ),
      },
    };
  }

  private authProvider(
    id: CapabilityId,
    available: boolean,
    clientId: string | null,
    disabledMessage: string,
  ): AuthProviderCapabilityDto {
    const state = this.withMaintenance(
      id,
      available
        ? this.state(CapabilityStatus.Enabled, 'Sẵn sàng.')
        : this.state(CapabilityStatus.Disabled, disabledMessage),
    );
    return {
      ...state,
      clientId: available && clientId !== '' ? clientId : null,
    };
  }

  private phoneOtpCapability(production: boolean): AuthProviderCapabilityDto {
    const configured = this.config.getOrThrow('AUTH_PHONE_OTP_ENABLED', {
      infer: true,
    });
    const state = this.withMaintenance(
      'auth.phoneOtp',
      configured && !production
        ? this.state(
            CapabilityStatus.Beta,
            'OTP đang dùng delivery phát triển và hiển thị code trực tiếp.',
          )
        : this.state(
            CapabilityStatus.Disabled,
            configured
              ? 'OTP chưa có provider gửi mã production.'
              : 'Đăng nhập bằng số điện thoại chưa được bật.',
          ),
    );
    return { ...state, clientId: null };
  }

  private nativeIapProvider(
    verifier: 'dev' | 'store' | 'disabled',
    credentialsReady: boolean,
    production: boolean,
    provider: string,
  ): CapabilityStateDto {
    if (verifier === 'dev' && !production) {
      return this.state(
        CapabilityStatus.Beta,
        `${provider} IAP đang dùng verifier phát triển.`,
      );
    }
    if (verifier === 'store' && credentialsReady) {
      return this.state(
        CapabilityStatus.Enabled,
        `${provider} IAP đã cấu hình.`,
      );
    }
    return this.state(
      CapabilityStatus.Disabled,
      `${provider} IAP chưa được cấu hình.`,
    );
  }

  private devOnlyCapability(
    id: CapabilityId,
    configured: boolean,
    production: boolean,
    betaMessage: string,
  ): CapabilityStateDto {
    return this.withMaintenance(
      id,
      configured && !production
        ? this.state(CapabilityStatus.Beta, betaMessage)
        : this.state(
            CapabilityStatus.Disabled,
            'Capability chưa có provider production.',
          ),
    );
  }

  private withMaintenance(
    id: CapabilityId,
    state: CapabilityStateDto,
  ): CapabilityStateDto {
    if (
      state.status !== CapabilityStatus.Disabled &&
      this.maintenance.has(id)
    ) {
      return this.state(
        CapabilityStatus.Maintenance,
        'Tính năng đang tạm bảo trì.',
      );
    }
    return state;
  }

  private state(status: CapabilityStatus, message: string): CapabilityStateDto {
    return { status, message };
  }

  private value(key: keyof CoreApiEnv): string {
    const value = this.config.getOrThrow(key, { infer: true });
    return typeof value === 'string' ? value : String(value);
  }
}
