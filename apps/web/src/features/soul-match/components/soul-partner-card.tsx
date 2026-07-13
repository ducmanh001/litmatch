'use client';

import { isApiError } from '@litmatch/api-client';

import { useSoulPartner } from '../api';

export function SoulPartnerCard({ sessionId }: { sessionId: string }) {
  const partner = useSoulPartner(sessionId, true);

  if (partner.isPending) {
    return <p className="text-sm text-muted-foreground">Đang mở khoá hồ sơ…</p>;
  }

  if (partner.isError) {
    const message = isApiError(partner.error)
      ? partner.error.message
      : 'Có lỗi xảy ra, thử lại.';
    return (
      <p role="alert" className="text-sm text-destructive">
        {message}
      </p>
    );
  }

  if (partner.data === undefined) return null;

  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-sm font-medium">
        Đã trở thành bạn với {partner.data.nickname}
      </p>
    </div>
  );
}
