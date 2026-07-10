import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserModule } from '../user';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthIdentity } from './entities/auth-identity.entity';
import { PhoneOtp } from './entities/phone-otp.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { OtpService } from './services/otp.service';
import { DevSmsProvider, SmsProvider, UnavailableSmsProvider } from './services/sms-provider';
import { SocialVerifierService } from './services/social-verifier';
import { TokenService } from './services/token.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuthIdentity, RefreshToken, PhoneOtp]),
    UserModule,
    JwtModule.registerAsync({
      global: true, // JwtAuthGuard global cần JwtService ở mọi nơi
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    OtpService,
    SocialVerifierService,
    {
      provide: SmsProvider,
      inject: [ConfigService],
      // Factory chỉ khởi tạo implementation được chọn. Production fail-closed riêng
      // endpoint OTP cho tới khi cắm provider thật; tuyệt đối không log OTP giả.
      useFactory: (config: ConfigService): SmsProvider =>
        config.getOrThrow<string>('NODE_ENV') === 'production'
          ? new UnavailableSmsProvider()
          : new DevSmsProvider(),
    },
  ],
  exports: [],
})
export class AuthModule {}
