import { SpanStatusCode, trace } from '@opentelemetry/api';

import type { Span } from '@opentelemetry/api';

/**
 * Bọc 1 thao tác (thường là 1 tick background job — matcher, call ticker) thành 1 root span đặt
 * tên rõ ràng (docs/07 Giai đoạn 6). Cần thiết vì DB/Redis client instrumentation của OTel chỉ
 * tự tạo span khi đã có PARENT span đang active trong context — ngoài 1 HTTP request (nơi
 * instrumentation-http tự tạo root span), background job chạy bằng `setInterval` không có parent
 * nào, nên nếu không bọc thủ công thì Redis/DB bên trong tick sẽ hoàn toàn vô hình trên trace
 * backend (đã verify hành vi `requireParentSpan` này bằng script tay trên `@opentelemetry/instrumentation-ioredis`).
 *
 * Khi tracing chưa bật (`startTracing` không được gọi/chưa cấu hình endpoint), `trace.getTracer()`
 * trả về no-op tracer — hàm này an toàn gọi vô điều kiện, không cần check "tracing có bật không".
 */
export async function withSpan<T>(
  tracerName: string,
  spanName: string,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer(tracerName);
  return tracer.startActiveSpan(spanName, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
}
