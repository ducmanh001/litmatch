import { ApiProperty } from '@nestjs/swagger';

/**
 * Response công khai lúc login/refresh (ADR 0007) — KHÔNG có `refreshToken`: giá trị đó chỉ
 * tồn tại trong cookie httpOnly, client không bao giờ thấy. `csrfToken` trả trong body để FE
 * echo lại qua header `X-CSRF-Token` lúc gọi `/auth/refresh`, `/auth/logout` (double-submit).
 */
export class AuthTokensDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() csrfToken!: string;
  @ApiProperty({ description: 'TTL access token (giây)' }) expiresIn!: number;
  @ApiProperty() userId!: string;
  @ApiProperty() isGuest!: boolean;
}
