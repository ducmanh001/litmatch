'use client';

import { isApiError } from '@litmatch/api-client';

import { ProfileIcon } from '../../../shared/ui/icons';
import { useSoulPartner } from '../api';

export function SoulPartnerCard({ sessionId }: { sessionId: string }) {
  const partner = useSoulPartner(sessionId, true);

  if (partner.isPending) {
    return (
      <p className="px-5 py-4 text-center text-sm text-slate-500 dark:text-slate-400">
        Đang mở khoá hồ sơ…
      </p>
    );
  }

  if (partner.isError) {
    const message = isApiError(partner.error)
      ? partner.error.message
      : 'Có lỗi xảy ra, thử lại.';
    return (
      <p role="alert" className="px-5 py-4 text-sm text-destructive">
        {message}
      </p>
    );
  }

  if (partner.data === undefined) return null;

  return (
    <div className="flex items-center gap-3 border-b border-black/5 px-5 pb-3 dark:border-white/5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surf2">
        <ProfileIcon width={18} height={18} />
      </div>
      <p className="flex-1 text-sm font-bold">
        Đã trở thành bạn với {partner.data.nickname}
      </p>
    </div>
  );
}
