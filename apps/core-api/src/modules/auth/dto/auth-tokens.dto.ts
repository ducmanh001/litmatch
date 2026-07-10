import { ApiProperty } from '@nestjs/swagger';

export class AuthTokensDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty({ description: 'TTL access token (giây)' }) expiresIn!: number;
  @ApiProperty() userId!: string;
  @ApiProperty() isGuest!: boolean;
}
