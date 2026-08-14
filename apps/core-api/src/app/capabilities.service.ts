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
            'Tính năng nạp tiền đang ở chế độ thử nghiệm (không phát sinh chi phí).',
          )
        : nativeApple.status === CapabilityStatus.Enabled &&
            nativeGoogle.status === CapabilityStatus.Enabled
          ? this.state(
              CapabilityStatus.Enabled,
              'Sẵn sàng thanh toán qua App Store và Google Play.',
            )
          : this.state(
              CapabilityStatus.Disabled,
              nativeIapProviders.length > 0
                ? `Hiện chỉ hỗ trợ thanh toán qua ${nativeIapProviders.join('/')}; client phải dùng trạng thái theo provider.`
                : 'Nạp tiền qua ứng dụng hiện chưa khả dụng.',
            ),
    );
    return {
      auth: {
        phoneOtp: this.phoneOtpCapability(),
        google: this.authProvider(
          'auth.google',
          googleClientId !== '',
          googleClientId,
          'Đăng nhập Google chưa khả dụng.',
        ),
        apple: this.authProvider(
          'auth.apple',
          appleClientId !== '',
          appleClientId,
          'Đăng nhập Apple chưa khả dụng.',
        ),
        facebook: this.authProvider(
          'auth.facebook',
          facebookReady,
          facebookReady ? facebookAppId : '',
          'Đăng nhập Facebook chưa khả dụng.',
        ),
        guest: this.state(
          CapabilityStatus.Enabled,
          'Có thể trải nghiệm ngay không cần đăng nhập.',
        ),
      },
      topUp: {
        web: this.withMaintenance(
          'topUp.web',
          payosReady
            ? this.state(
                CapabilityStatus.Enabled,
                'Thanh toán nhanh qua VietQR / Chuyển khoản ngân hàng..',
              )
            : this.state(
                CapabilityStatus.Disabled,
                'Phương thức nạp tiền này hiện chưa khả dụng.',
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
          'Tính năng tải video lên đang ở bản thử nghiệm',
        ),
        transcode: this.devOnlyCapability(
          'video.transcode',
          videoEnabled,
          production,
          'Tính năng xử lý video đang ở bản thử nghiệm.',
        ),
      },
      notifications: {
        push: this.withMaintenance(
          'notifications.push',
          pushProvider === 'dev' && !production
            ? this.state(
                CapabilityStatus.Beta,
                'Tính năng thông báo đang ở chế độ thử nghiệm.',
              )
            : this.state(
                CapabilityStatus.Disabled,
                'Tính năng thông báo hiện chưa khả dụng.',
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
        ? this.state(CapabilityStatus.Enabled, 'Đã sẵn sàng sử dụng.')
        : this.state(CapabilityStatus.Disabled, disabledMessage),
    );
    return {
      ...state,
      clientId: available && clientId !== '' ? clientId : null,
    };
  }

  private phoneOtpCapability(): AuthProviderCapabilityDto {
    const configured = this.config.getOrThrow('AUTH_PHONE_OTP_ENABLED', {
      infer: true,
    });
    const state = this.withMaintenance(
      'auth.phoneOtp',
      configured
        ? this.state(
            CapabilityStatus.Beta,
            'Đăng nhập bằng số điện thoại (chế độ thử nghiệm).',
          )
        : this.state(
            CapabilityStatus.Disabled,
            'Đăng nhập bằng số điện thoại hiện chưa khả dụng.',
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
        `Thanh toán qua ${provider} đang ở chế độ thử nghiệm.`,
      );
    }
    if (verifier === 'store' && credentialsReady) {
      return this.state(
        CapabilityStatus.Enabled,
        `Thanh toán qua ${provider} đã sẵn sàng.`,
      );
    }
    return this.state(
      CapabilityStatus.Disabled,
      `Thanh toán qua ${provider} hiện chưa khả dụng.`,
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
            'Tính năng này hiện chưa khả dụng.',
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
        'Tính năng đang tạm bảo trì. Vui lòng quay lại sau..',
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
