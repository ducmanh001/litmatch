import { SetMetadata } from '@nestjs/common';

import type { Role } from '@litmatch/common-dtos';

export const ROLES_KEY = 'roles';

/**
 * Đánh dấu endpoint/controller chỉ cho phép role liệt kê (docs/12 § 12.7 Task 0). Áp ở
 * CLASS level cho controller admin (như `@Public()` ở `AuthController`) — route mới thêm
 * vào cùng controller tự động được bọc, không cần nhớ khai lại per-route.
 *
 * Tên `RequireRoles` (không phải `Roles`) để tránh đụng `Roles` (giá trị enum-like) export
 * từ `@litmatch/common-dtos` — 2 cái luôn dùng cùng nhau tại chỗ gọi: `@RequireRoles(Roles.Admin)`.
 */
export const RequireRoles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
