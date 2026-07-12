import type { ApiErrorBody } from '@litmatch/common-dtos/pure';

/**
 * Mã lỗi phía client — CHỈ cho trường hợp không có response từ server (mất mạng, DNS,
 * server chết). Prefix `CLIENT_` để không bao giờ va chạm namespace mã lỗi backend
 * (`DOMAIN_SUBJECT_REASON` — docs/05 § 5.5).
 */
export const CLIENT_NETWORK_ERROR = 'CLIENT_NETWORK_ERROR';
/** Body lỗi không đúng envelope `{ error: {...} }` — backend đổi hợp đồng hoặc proxy trả HTML. */
export const CLIENT_MALFORMED_ERROR = 'CLIENT_MALFORMED_ERROR';

/**
 * Lỗi API duy nhất mọi tầng UI bắt (docs/13 § 13.7) — switch theo `code`, không parse
 * message. `traceId` hiển thị cho ops tra log (rỗng khi lỗi xảy ra trước khi tới server).
 */
export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly status: number;
  readonly code: string;
  readonly traceId: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message);
    this.status = status;
    this.code = body.code;
    this.traceId = body.traceId;
    this.details = body.details;
  }

  static network(cause: unknown): ApiError {
    const err = new ApiError(0, {
      code: CLIENT_NETWORK_ERROR,
      message: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
      traceId: '',
    });
    err.cause = cause;
    return err;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** Parse body lỗi từ Response — chịu được body không phải JSON/không đúng envelope. */
export async function apiErrorFromResponse(
  response: Response,
): Promise<ApiError> {
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    parsed = undefined;
  }
  const error = (parsed as Partial<ApiErrorBody> | undefined)?.error;
  if (
    error &&
    typeof error.code === 'string' &&
    typeof error.message === 'string'
  ) {
    return new ApiError(response.status, {
      code: error.code,
      message: error.message,
      traceId: typeof error.traceId === 'string' ? error.traceId : '',
      details: error.details,
    });
  }
  return new ApiError(response.status, {
    code: CLIENT_MALFORMED_ERROR,
    message: `Máy chủ trả lỗi ${response.status} không đúng định dạng.`,
    traceId: '',
  });
}
