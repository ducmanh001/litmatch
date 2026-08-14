import {
  isPollingStatus,
  MATCHING_TICKET_REFETCH_INTERVAL_MS,
  toJoinQueueRequest,
} from './api';
import { matchingKeys, useCancelTicket } from './api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { vi } from 'vitest';

import { apiClient } from '../../shared/api/client';

describe('isPollingStatus', () => {
  it('dùng fallback 10 giây vì realtime là kênh chính', () => {
    expect(MATCHING_TICKET_REFETCH_INTERVAL_MS).toBe(10_000);
  });

  it('poll tiếp khi queued hoặc matched', () => {
    expect(isPollingStatus('queued')).toBe(true);
    expect(isPollingStatus('matched')).toBe(true);
  });

  it('dừng poll ở trạng thái chốt/chuyển màn', () => {
    expect(isPollingStatus('confirmed')).toBe(false);
    expect(isPollingStatus('expired')).toBe(false);
    expect(isPollingStatus('cancelled')).toBe(false);
    expect(isPollingStatus(undefined)).toBe(false);
  });
});

describe('join queue request compatibility', () => {
  it('sends the required paid-match flag when it is false', () => {
    expect(
      toJoinQueueRequest({
        matchType: 'soul',
        useDiamond: false,
        genderPreference: 'any',
      }),
    ).toEqual({
      matchType: 'soul',
      useDiamond: false,
      genderPreference: 'any',
    });
  });

  it('keeps an explicit paid request in the payload', () => {
    expect(
      toJoinQueueRequest({
        matchType: 'voice',
        useDiamond: true,
        genderPreference: 'female',
      }),
    ).toEqual({
      matchType: 'voice',
      useDiamond: true,
      genderPreference: 'female',
    });
  });
});

describe('matching ticket cache lifecycle', () => {
  afterEach(() => vi.restoreAllMocks());

  it('xóa current ticket ngay sau khi hủy để tìm lượt mới không cần reload', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(matchingKeys.current, {
      ticket: { id: 'ticket-1' },
    });
    vi.spyOn(apiClient, 'DELETE').mockResolvedValue({
      data: { data: { id: 'ticket-1', status: 'cancelled' } },
    } as never);

    const { result } = renderHook(() => useCancelTicket('ticket-1'), {
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client: queryClient }, children),
    });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(matchingKeys.current)).toEqual({
      ticket: null,
    });
  });
});
