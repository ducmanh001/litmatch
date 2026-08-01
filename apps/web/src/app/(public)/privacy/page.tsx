'use client';

import Link from 'next/link';

import {
  usePrivacySettings,
  useUpdatePrivacySettings,
} from '../../../features/privacy/api';
import { ProductAnalyticsPreference } from '../../../shared/analytics/product-analytics-components';
import { isApiError } from '@litmatch/api-client';
import { useIsAuthenticated } from '../../../shared/auth/use-session';
import { showToast } from '../../../shared/lib/toast-store';

import type { PrivacySettingsDto } from '../../../features/privacy/api';

const VISIBILITY_SETTINGS = [
  {
    key: 'showOnlineStatus',
    label: 'Hiện trạng thái hoạt động',
    description: 'Người khác thấy chấm xanh khi bạn online',
    defaultOn: true,
    onMessage: 'Đã bật hiện trạng thái hoạt động',
    offMessage: 'Đã tắt hiện trạng thái hoạt động',
    warnOnEnable: false,
  },
  {
    key: 'showDistance',
    label: 'Hiện khoảng cách',
    description: 'Hiện số km ước lượng ở Khám phá',
    defaultOn: true,
    onMessage: 'Đã bật hiện khoảng cách',
    offMessage: 'Đã tắt hiện khoảng cách',
    warnOnEnable: false,
  },
  {
    key: 'searchableByPhone',
    label: 'Cho phép tìm qua số điện thoại',
    description: 'Người có số của bạn có thể tìm thấy hồ sơ',
    defaultOn: false,
    onMessage: 'Đã bật tìm qua số điện thoại',
    offMessage: 'Đã tắt tìm qua số điện thoại',
    warnOnEnable: false,
  },
  {
    key: 'hideProfile',
    label: 'Ẩn hồ sơ tạm thời',
    description: 'Tạm ngưng xuất hiện ở Khám phá & Feed',
    defaultOn: false,
    onMessage: 'Đã ẩn hồ sơ tạm thời',
    offMessage: 'Đã hiện lại hồ sơ',
    warnOnEnable: true,
  },
] as const;

function Toggle({
  on,
  disabled,
  label,
  onToggle,
}: {
  on: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        on ? 'bg-irisl' : 'bg-black/15 dark:bg-white/15'
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
          on ? 'translate-x-5' : ''
        }`}
      />
    </button>
  );
}

/** Trang quyền riêng tư — state visibility được đọc/ghi qua core-api. */
export default function PrivacyPage() {
  const isAuthenticated = useIsAuthenticated();
  const settingsQuery = usePrivacySettings();
  const updateSettings = useUpdatePrivacySettings();
  const settings: PrivacySettingsDto = settingsQuery.data ?? {
    showOnlineStatus: true,
    showDistance: true,
    searchableByPhone: false,
    hideProfile: false,
  };

  const toggle = (
    key: keyof PrivacySettingsDto,
    onMessage: string,
    offMessage: string,
    warnOnEnable = false,
  ) => {
    if (!isAuthenticated) {
      showToast('Đăng nhập để thay đổi quyền riêng tư', 'warn');
      return;
    }
    const next = { ...settings, [key]: !settings[key] };
    updateSettings.mutate(next, {
      onSuccess: () =>
        showToast(
          next[key] ? onMessage : offMessage,
          next[key] && warnOnEnable ? 'warn' : 'default',
        ),
      onError: (error) =>
        showToast(
          isApiError(error) ? error.message : 'Không thể lưu quyền riêng tư.',
          'warn',
        ),
    });
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-xl px-5 py-10">
      <h1 className="font-display mb-6 text-xl font-semibold italic">
        Quyền riêng tư, chặn &amp; báo cáo
      </h1>

      <div className="space-y-6">
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Hiển thị
          </p>
          <div className="divide-y divide-black/5 overflow-hidden rounded-2xl border border-black/5 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-surf">
            {VISIBILITY_SETTINGS.map((setting) => (
              <div
                key={setting.key}
                className="flex items-center gap-3 px-4 py-3.5"
              >
                <div className="flex-1">
                  <p className="text-sm font-semibold">{setting.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {setting.description}
                  </p>
                </div>
                <Toggle
                  on={settings[setting.key]}
                  label={setting.label}
                  disabled={
                    !isAuthenticated ||
                    settingsQuery.isPending ||
                    settingsQuery.isError ||
                    updateSettings.isPending
                  }
                  onToggle={() =>
                    toggle(
                      setting.key,
                      setting.onMessage,
                      setting.offMessage,
                      setting.warnOnEnable,
                    )
                  }
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Báo cáo &amp; an toàn
          </p>
          <div className="divide-y divide-black/5 overflow-hidden rounded-2xl border border-black/5 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-surf">
            <Link href="/help" className="flex items-center gap-3 px-4 py-3.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
                <svg
                  width={15}
                  height={15}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path d="M12 9v4M12 17h.01" />
                  <path
                    d="M10.3 3.9L2.5 17a2 2 0 001.7 3h15.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="flex-1 text-sm font-semibold">
                Báo cáo một người dùng
              </span>
            </Link>
            <Link href="/help" className="flex items-center gap-3 px-4 py-3.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-iris/10 text-irisl">
                <svg
                  width={15}
                  height={15}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path
                    d="M12 22s8-4.5 8-11V5l-8-3-8 3v6c0 6.5 8 11 8 11z"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="flex-1 text-sm font-semibold">
                Trung tâm an toàn cộng đồng
              </span>
            </Link>
          </div>
        </div>

        <ProductAnalyticsPreference />
      </div>
    </main>
  );
}
