import type { JwtService } from '@nestjs/jwt';

/**
 * Verify access token với khoá hiện tại (`JWT_SECRET`); chỉ khi CHỮ KÝ không khớp mới thử khoá cũ
 * (`JWT_SECRET_PREVIOUS`) để token đã phát trước lúc xoay khoá còn sống tới hết TTL. Token hết hạn,
 * sai định dạng hoặc sai claim KHÔNG được thử lại với khoá cũ. Token luôn được ký bằng khoá hiện tại.
 *
 * Bản sao cùng logic nằm ở `apps/core-api/src/common/guards/jwt-rotation.ts` — hai app deploy độc
 * lập nên không import chéo; sửa một nơi phải sửa nơi kia.
 */
export async function verifyJwtWithRotation<T extends object>(
  jwtService: JwtService,
  token: string,
  previousSecret: string | undefined,
): Promise<T> {
  try {
    return await jwtService.verifyAsync<T>(token);
  } catch (error) {
    if (!previousSecret || !isInvalidSignature(error)) throw error;
    return jwtService.verifyAsync<T>(token, { secret: previousSecret });
  }
}

function isInvalidSignature(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === 'JsonWebTokenError' &&
    error.message === 'invalid signature'
  );
}
