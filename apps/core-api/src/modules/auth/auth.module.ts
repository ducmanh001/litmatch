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
import { DevSmsProvider, SmsProvider } from './services/sms-provider';
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
    { provide: SmsProvider, useClass: DevSmsProvider }, // đổi sang provider thật khi tích hợp SMS
  ],
  exports: [],
})
export class AuthModule {}
