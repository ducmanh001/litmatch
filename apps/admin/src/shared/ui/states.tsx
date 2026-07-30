import { isApiError } from '@litmatch/api-client';
import { AlertTriangle, Copy, Inbox, Loader2 } from 'lucide-react';

import { copyToClipboard } from '../lib/copy-to-clipboard';
import { showToast } from '../lib/toast-store';

/**
 * 3 trạng thái chuẩn của màn hình dữ liệu (docs/13 § 13.7) — mọi page dùng chung bộ này,
 * không tự chế spinner/empty/error riêng từng nơi.
 */

export function LoadingState({ label = 'Đang tải…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      <Inbox className="size-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {hint !== undefined && (
        <p className="text-sm text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

/** Admin bắt buộc hiện traceId để ops tra log (docs/13 § 13.7). */
export function ErrorState({ error }: { error: unknown }) {
  const apiError = isApiError(error) ? error : null;
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-2 py-16 text-center"
    >
      <AlertTriangle className="size-8 text-destructive" aria-hidden />
      <p className="font-medium">
        {apiError?.message ?? 'Có lỗi không xác định. Thử tải lại trang.'}
      </p>
      {apiError !== null && (
        <div className="flex flex-wrap items-center justify-center gap-2 font-mono text-xs text-muted-foreground">
          <span>
            {apiError.code}
            {apiError.traceId !== '' && ` · trace: ${apiError.traceId}`}
          </span>
          {apiError.traceId !== '' && (
            <button
              type="button"
              aria-label="Sao chép trace ID"
              title="Sao chép trace ID"
              className="rounded-md p-1 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              onClick={async () => {
                const copied = await copyToClipboard(apiError.traceId);
                showToast(
                  copied
                    ? 'Đã sao chép trace ID'
                    : 'Không thể sao chép; hãy chọn trace ID thủ công',
                  copied ? undefined : 'warn',
                );
              }}
            >
              <Copy className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
