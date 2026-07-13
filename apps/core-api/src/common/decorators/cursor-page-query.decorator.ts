import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiQuery } from '@nestjs/swagger';

/**
 * Decorator OpenAPI cho mọi endpoint nhận `@Query() query: CursorPageQueryDto`
 * (`@litmatch/common-dtos`). DTO đó chỉ có decorator `class-validator` (không có
 * `@ApiProperty`) vì nó nằm ở entry chính `common-dtos` — entry đó KHÔNG được phép import
 * `@nestjs/swagger` (sẽ kéo theo phụ thuộc backend-only vào lib dùng chung cả backend lẫn
 * frontend). Vì vậy Swagger schema cho `limit`/`cursor` phải khai riêng ở từng controller
 * qua decorator này, không khai trong DTO.
 */
export function ApiCursorPageQuery(): MethodDecorator {
  return applyDecorators(
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      description: 'Số item tối đa mỗi trang (1-100, mặc định 20)',
    }),
    ApiQuery({
      name: 'cursor',
      required: false,
      type: String,
      description: 'Cursor opaque từ `meta.nextCursor` của trang trước',
    }),
  );
}

/**
 * Decorator OpenAPI cho field `meta: CursorPageMeta` trên response DTO. `CursorPageMeta`
 * (`@litmatch/common-dtos`) là interface thuần — không có runtime metadata cho
 * `@ApiProperty()` tự suy ra, nên khai `schema` tường minh ở đây; nếu không Swagger emit
 * `meta` thành object rỗng và FE mất field `nextCursor` cần cho cursor pagination.
 */
export function ApiCursorPageMeta(): PropertyDecorator {
  return ApiProperty({
    type: 'object',
    properties: { nextCursor: { type: 'string', nullable: true } },
  });
}
