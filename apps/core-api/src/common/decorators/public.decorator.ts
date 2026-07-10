import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Đánh dấu endpoint không cần access token (login, health...). Mặc định mọi endpoint đều cần auth. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
