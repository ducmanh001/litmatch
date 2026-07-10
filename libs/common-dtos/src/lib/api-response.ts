/** Envelope response thống nhất toàn hệ thống (docs/05 § 5.4). */
export interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    traceId: string;
    details?: Record<string, unknown>;
  };
}
