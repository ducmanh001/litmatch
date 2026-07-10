import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

import type { ApiResponse } from '@litmatch/common-dtos';

/** Bọc mọi response thành công vào envelope { data, meta? } (docs/05 § 5.4). */
@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((value) => {
        // Controller trả { data, meta } sẵn (vd list có nextCursor) thì giữ nguyên
        if (value && typeof value === 'object' && 'data' in (value as object)) {
          return value as unknown as ApiResponse<T>;
        }
        return { data: value };
      }),
    );
  }
}
