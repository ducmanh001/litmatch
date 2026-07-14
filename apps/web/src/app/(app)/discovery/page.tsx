'use client';

import { isApiError } from '@litmatch/api-client';
import { useState } from 'react';

import { useBrowse, useNearby } from '../../../features/discovery/api';
import { DiscoveryCard } from '../../../features/discovery/components/discovery-card';
import { DiscoveryDetailSheet } from '../../../features/discovery/components/discovery-detail-sheet';
import { DiscoveryFilters } from '../../../features/discovery/components/discovery-filters';
import { NearbyOptIn } from '../../../features/discovery/components/nearby-opt-in';
import { useCreateInvite } from '../../../features/matching/invite-api';

import type {
  DiscoveryCardDto,
  Gender,
  NearbyCardDto,
} from '../../../features/discovery/api';

/** /discovery — đúng layouts/web/discovery.html, dữ liệu thật qua module `discovery` (W1+W4). */
export default function DiscoveryPage() {
  const [mode, setMode] = useState<'browse' | 'nearby'>('browse');
  const [gender, setGender] = useState<Gender | undefined>(undefined);
  const [nearbyEnabled, setNearbyEnabled] = useState(false);
  const [selected, setSelected] = useState<
    DiscoveryCardDto | NearbyCardDto | null
  >(null);

  const filter = { gender, ageMin: undefined, ageMax: undefined };
  // Chỉ gọi API của nhánh đang active — nearby luôn 403 khi chưa bật nearbyVisible, gọi cả 2
  // song song sẽ có 1 nhánh luôn lỗi vô ích (phát hiện qua verify thật bằng browser thật).
  const browseQuery = useBrowse(filter, { enabled: mode === 'browse' });
  const nearbyQuery = useNearby(filter, {
    enabled: mode === 'nearby' && nearbyEnabled,
  });

  const createInvite = useCreateInvite();

  // Hai query có shape item khác nhau (DiscoveryCardDto vs NearbyCardDto) — không gộp vào 1
  // biến query dùng chung để tránh TS collapse sai kiểu union khi đọc `.data.pages`.
  const items: (DiscoveryCardDto | NearbyCardDto)[] =
    mode === 'browse'
      ? (browseQuery.data?.pages.flatMap((page) => page?.items ?? []) ?? [])
      : (nearbyQuery.data?.pages.flatMap((page) => page?.items ?? []) ?? []);
  const isPending =
    mode === 'browse' ? browseQuery.isPending : nearbyQuery.isPending;
  const isError = mode === 'browse' ? browseQuery.isError : nearbyQuery.isError;
  const error = mode === 'browse' ? browseQuery.error : nearbyQuery.error;
  const hasNextPage =
    mode === 'browse' ? browseQuery.hasNextPage : nearbyQuery.hasNextPage;
  const isFetchingNextPage =
    mode === 'browse'
      ? browseQuery.isFetchingNextPage
      : nearbyQuery.isFetchingNextPage;
  const fetchNextPage =
    mode === 'browse' ? browseQuery.fetchNextPage : nearbyQuery.fetchNextPage;

  return (
    <div>
      <div className="flex items-center justify-between px-5 pb-3 pt-6">
        <div>
          <h1 className="font-display text-2xl font-semibold italic">
            Khám phá
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Duyệt hồ sơ quanh bạn — mới
          </p>
        </div>
      </div>

      <DiscoveryFilters
        gender={gender}
        onGenderChange={setGender}
        mode={mode}
        onModeChange={setMode}
      />

      {mode === 'nearby' && !nearbyEnabled ? (
        <NearbyOptIn onEnabled={() => setNearbyEnabled(true)} />
      ) : (
        <>
          {isPending && (
            <p className="px-5 text-sm text-slate-500 dark:text-slate-400">
              Đang tải…
            </p>
          )}
          {isError && (
            <p role="alert" className="px-5 text-sm text-destructive">
              {isApiError(error) ? error.message : 'Có lỗi xảy ra, thử lại.'}
            </p>
          )}
          {!isPending && !isError && items.length === 0 && (
            <p className="px-5 text-sm text-slate-500 dark:text-slate-400">
              Chưa có ai phù hợp lúc này.
            </p>
          )}
          {items.length > 0 && (
            <div className="grid grid-cols-2 gap-3 px-5 lg:grid-cols-4">
              {items.map((card) => (
                <DiscoveryCard
                  key={card.profile.id}
                  card={card}
                  onClick={() => {
                    setSelected(card);
                    createInvite.reset();
                  }}
                />
              ))}
            </div>
          )}
          {hasNextPage && (
            <div className="px-5 pt-4">
              <button
                type="button"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
                className="h-9 w-full rounded-full border border-black/10 text-sm disabled:opacity-50 dark:border-white/10"
              >
                {isFetchingNextPage ? 'Đang tải…' : 'Xem thêm'}
              </button>
            </div>
          )}
        </>
      )}

      {selected !== null && (
        <DiscoveryDetailSheet
          card={selected}
          onClose={() => setSelected(null)}
          onInvite={(matchType) =>
            createInvite.mutate({
              inviteeUserId: selected.profile.id,
              matchType,
            })
          }
          inviteId={createInvite.data?.id}
          isInviting={createInvite.isPending}
          inviteError={
            isApiError(createInvite.error)
              ? createInvite.error.message
              : createInvite.isError
                ? 'Có lỗi xảy ra, thử lại.'
                : undefined
          }
          invitedMatchType={createInvite.data?.matchType}
        />
      )}
    </div>
  );
}
