import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { CoreApiEnv } from '../../config/env.validation';
import { UserModule } from '../user';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthIdentity } from './entities/auth-identity.entity';
import { PhoneOtp } from './entities/phone-otp.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { OtpService } from './services/otp.service';
import { SocialVerifierService } from './services/social-verifier';
import { TokenService } from './services/token.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuthIdentity, RefreshToken, PhoneOtp]),
    UserModule,
    JwtModule.registerAsync({
      global: true, // JwtAuthGuard global cần JwtService ở mọi nơi
      inject: [ConfigService],
      useFactory: (config: ConfigService<CoreApiEnv, true>) => ({
        secret: config.getOrThrow('JWT_SECRET', { infer: true }),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, OtpService, SocialVerifierService],
  exports: [],
})
export class AuthModule {}
