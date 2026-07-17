'use client';

import { isApiError } from '@litmatch/api-client';
import { useState } from 'react';

import {
  useBrowse,
  useNearby,
  useSetNearbyVisible,
} from '../../../features/discovery/api';
import { DiscoveryCard } from '../../../features/discovery/components/discovery-card';
import { DiscoveryDetailSheet } from '../../../features/discovery/components/discovery-detail-sheet';
import {
  DiscoveryFilters,
  DiscoveryModeToggle,
  getDiscoveryAgeBounds,
} from '../../../features/discovery/components/discovery-filters';
import { NearbyOptIn } from '../../../features/discovery/components/nearby-opt-in';
import { useCreateInvite } from '../../../features/matching/invite-api';
import { MicIcon } from '../../../shared/ui/icons';
import {
  EYEBROW_ICON_GRADIENT_ID,
  PageHeader,
} from '../../../shared/ui/page-header';

import type {
  DiscoveryCardDto,
  Gender,
  NearbyCardDto,
} from '../../../features/discovery/api';
import type { DiscoveryAgeRange } from '../../../features/discovery/components/discovery-filters';

const NEARBY_NOT_OPTED_IN = 'DISCOVERY_NEARBY_NOT_OPTED_IN';
const NEARBY_LOCATION_MISSING = 'DISCOVERY_NEARBY_LOCATION_MISSING';

function HeartLineIcon() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.7-7.5 1.1-1.1a5.5 5.5 0 0 0 0-7.8Z" />
    </svg>
  );
}

/** Heart tô gradient thương hiệu dùng chung của eyebrow-pill (xem EYEBROW_ICON_GRADIENT_ID ở
 * page-header.tsx) — icon fill riêng nên phải tự trỏ url(#id), không ăn được override stroke
 * mà HeaderEyebrow áp cho các icon dùng stroke. */
function EyebrowHeartIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden>
      <path
        fill={`url(#${EYEBROW_ICON_GRADIENT_ID})`}
        d="M12 21s-7.5-4.9-10.2-9.3C.3 8.8 1.6 5 5.2 4.2c2-.4 3.9.5 4.9 2.1L12 8.5l1.9-2.2c1-1.6 2.9-2.5 4.9-2.1C22.4 5 23.7 8.8 22.2 11.7 19.5 16.1 12 21 12 21z"
      />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.7-5.1A7.5 7.5 0 0 1 3 12V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
    </svg>
  );
}

function LoadingCards() {
  return (
    <div
      aria-label="Đang tải hồ sơ"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="aspect-[4/5] animate-pulse rounded-[1.4rem] bg-muted dark:bg-surf2/70"
        />
      ))}
    </div>
  );
}

/** /discovery — màn duyệt chủ động + Nearby, dữ liệu thật qua module `discovery` (W1+W4). */
export default function DiscoveryPage() {
  const [mode, setMode] = useState<'browse' | 'nearby'>('nearby');
  const [gender, setGender] = useState<Gender | undefined>(undefined);
  const [ageRange, setAgeRange] = useState<DiscoveryAgeRange>('all');
  const [selected, setSelected] = useState<
    DiscoveryCardDto | NearbyCardDto | null
  >(null);

  const filter = { gender, ...getDiscoveryAgeBounds(ageRange) };
  // Chỉ gọi API của nhánh đang active — nearby luôn 403 khi chưa bật nearbyVisible, gọi cả 2
  // song song sẽ có 1 nhánh luôn lỗi vô ích (phát hiện qua verify thật bằng browser thật).
  const browseQuery = useBrowse(filter, { enabled: mode === 'browse' });
  const nearbyQuery = useNearby(filter, {
    enabled: mode === 'nearby',
  });

  const createInvite = useCreateInvite();
  const setNearbyVisible = useSetNearbyVisible();

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
  const nearbySetupCode =
    mode === 'nearby' && isApiError(nearbyQuery.error)
      ? nearbyQuery.error.code
      : undefined;
  const nearbyNeedsSetup =
    nearbySetupCode === NEARBY_NOT_OPTED_IN ||
    nearbySetupCode === NEARBY_LOCATION_MISSING;

  const resetFilters = () => {
    setGender(undefined);
    setAgeRange('all');
  };

  return (
    <div className="mx-auto w-full max-w-[1120px] px-5 pt-0 md:px-8 md:pb-16 md:pt-0">
      <PageHeader
        eyebrow="Hẹn hò có chủ đích"
        eyebrowIcon={<EyebrowHeartIcon />}
      />

      <section className="rounded-3xl border border-iris/15 bg-card p-6 shadow-sm shadow-iris/[0.04] dark:border-white/10 dark:bg-gradient-to-br dark:from-surf dark:to-iris/[0.04] dark:shadow-none sm:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between md:gap-10">
          <div className="max-w-2xl">
            <h1 className="font-display max-w-2xl text-3xl font-semibold leading-tight dark:text-white md:text-4xl">
              Gặp một người thật lòng, bắt đầu từ một lời chào tử tế.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground dark:text-white/80 md:text-base">
              Tìm người phù hợp hoặc khám phá những kết nối ở gần bạn. Chọn cách
              mở lời bằng trò chuyện hay voice khi bạn thực sự muốn tìm hiểu.
            </p>
            <DiscoveryModeToggle
              mode={mode}
              onModeChange={(nextMode) => {
                setMode(nextMode);
                setSelected(null);
              }}
              className="mt-5"
            />
          </div>

          <div className="hidden shrink-0 gap-3 md:flex md:w-[270px] md:flex-col">
            <div className="rounded-2xl border border-iris/15 bg-card p-4 dark:border-white/10 dark:bg-surf">
              <p className="bg-gradient-to-r from-irisl to-aqual bg-clip-text text-2xl font-extrabold text-transparent">
                02
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground dark:text-white/75">
                cách bắt đầu: trò chuyện hoặc voice
              </p>
            </div>
            <div className="rounded-2xl border border-iris/15 bg-card p-4 dark:border-white/10 dark:bg-surf">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-iris/10 text-irisl dark:bg-rose-300/15 dark:text-white">
                <HeartLineIcon />
              </span>
              <p className="mt-2 text-sm font-extrabold dark:text-white">
                Bạn luôn chủ động
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground dark:text-white/75">
                Xem hồ sơ trước, chỉ gửi lời mời khi thấy phù hợp.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-5">
        <DiscoveryFilters
          gender={gender}
          onGenderChange={setGender}
          ageRange={ageRange}
          onAgeRangeChange={setAgeRange}
        />
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_270px] lg:gap-8">
        <main>
          {mode === 'nearby' && nearbyNeedsSetup ? (
            <NearbyOptIn
              needsLocationRefresh={nearbySetupCode === NEARBY_LOCATION_MISSING}
              onEnabled={() => void nearbyQuery.refetch()}
            />
          ) : (
            <section aria-labelledby="discovery-results-heading">
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-extrabold tracking-[0.12em] text-irisl dark:text-white/85">
                    {mode === 'browse' ? 'DÀNH CHO BẠN' : 'CÙNG Ở GẦN ĐÂY'}
                  </p>
                  <h2
                    id="discovery-results-heading"
                    className="mt-1 text-xl font-extrabold dark:text-white"
                  >
                    {mode === 'browse'
                      ? 'Những người bạn có thể muốn làm quen'
                      : 'Kết nối quanh bạn'}
                  </h2>
                </div>
                {items.length > 0 && (
                  <p className="shrink-0 text-xs font-semibold text-muted-foreground dark:text-white/70">
                    {items.length} hồ sơ
                  </p>
                )}
              </div>

              {isPending && <LoadingCards />}

              {isError && (
                <div
                  role="alert"
                  className="rounded-3xl border border-border bg-card p-6 text-center dark:border-white/10 dark:bg-surf"
                >
                  <p className="text-sm text-destructive">
                    {isApiError(error)
                      ? error.message
                      : 'Có lỗi xảy ra khi tải hồ sơ.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (mode === 'browse') void browseQuery.refetch();
                      else void nearbyQuery.refetch();
                    }}
                    className="mt-4 rounded-full border border-border px-4 py-2 text-sm font-bold hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:border-white/15 dark:bg-surf2/55 dark:text-white dark:hover:bg-surf2"
                  >
                    Thử lại
                  </button>
                </div>
              )}

              {!isPending && !isError && items.length === 0 && (
                <div className="rounded-3xl border border-border bg-card p-7 text-center dark:border-white/10 dark:bg-surf">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted dark:bg-rose-300/10 dark:text-white">
                    <HeartLineIcon />
                  </span>
                  <p className="mt-4 font-extrabold dark:text-white">
                    Chưa có ai phù hợp lúc này
                  </p>
                  <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-muted-foreground dark:text-white/75">
                    Hãy thử mở rộng khoảng tuổi hoặc chọn mọi người. Những kết
                    nối mới sẽ xuất hiện tại đây.
                  </p>
                  {(gender !== undefined || ageRange !== 'all') && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="mt-4 rounded-full bg-gradient-to-r from-aqua to-irisl px-5 py-2.5 text-sm font-extrabold text-white shadow-sm shadow-iris/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      Xóa bộ lọc
                    </button>
                  )}
                </div>
              )}

              {items.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4">
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
                <div className="pt-5">
                  <button
                    type="button"
                    disabled={isFetchingNextPage}
                    onClick={() => void fetchNextPage()}
                    className="h-11 w-full rounded-full border border-border bg-card text-sm font-bold transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 dark:border-white/10 dark:bg-surf dark:text-white dark:hover:bg-surf2"
                  >
                    {isFetchingNextPage ? 'Đang tải…' : 'Xem thêm hồ sơ'}
                  </button>
                </div>
              )}
            </section>
          )}
        </main>

        <aside className="space-y-4 lg:sticky lg:top-5">
          <section className="rounded-3xl border border-iris/15 bg-card p-5 shadow-sm shadow-iris/[0.04] dark:border-white/10 dark:bg-gradient-to-br dark:from-surf dark:to-iris/[0.04] dark:shadow-none">
            <h2 className="font-extrabold dark:text-white">
              Bắt đầu theo nhịp của bạn
            </h2>
            <div className="mt-4 space-y-4">
              <div className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-iris/10 text-irisl dark:bg-rose-300/15 dark:text-white">
                  <MessageIcon />
                </span>
                <div>
                  <p className="text-sm font-bold dark:text-white">
                    Trò chuyện trước
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground dark:text-white/75">
                    Dành thời gian tìm hiểu qua Soul Match.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-iris/10 text-irisl dark:bg-rose-300/15 dark:text-white">
                  <MicIcon width={18} height={18} />
                </span>
                <div>
                  <p className="text-sm font-bold dark:text-white">
                    Nghe thấy sự đồng điệu
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground dark:text-white/75">
                    Một cuộc Voice Match ngắn giúp câu chuyện tự nhiên hơn.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl bg-gradient-to-br from-irisl to-aqual p-5 text-white shadow-lg shadow-iris/20">
            <p className="text-sm font-extrabold">Hẹn hò an toàn, tôn trọng</p>
            <p className="mt-2 text-xs leading-5 opacity-75">
              Hãy trò chuyện đủ lâu, tôn trọng ranh giới của nhau và chọn nơi
              công cộng nếu quyết định gặp mặt.
            </p>
            {mode === 'nearby' && !nearbyNeedsSetup && !isError && (
              <div className="mt-4 border-t border-white/20 pt-4">
                <button
                  type="button"
                  disabled={setNearbyVisible.isPending}
                  onClick={() =>
                    setNearbyVisible.mutate(false, {
                      onSuccess: () => {
                        setSelected(null);
                        void nearbyQuery.refetch();
                      },
                    })
                  }
                  className="text-xs font-extrabold underline decoration-white/40 underline-offset-4 transition hover:decoration-white disabled:opacity-50"
                >
                  {setNearbyVisible.isPending
                    ? 'Đang tắt…'
                    : 'Tắt Quanh đây và xoá vị trí'}
                </button>
                {setNearbyVisible.isError && (
                  <p role="alert" className="mt-2 text-xs text-red-200">
                    {isApiError(setNearbyVisible.error)
                      ? setNearbyVisible.error.message
                      : 'Không thể tắt Quanh đây lúc này.'}
                  </p>
                )}
              </div>
            )}
          </section>
        </aside>
      </div>

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
