import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type PalmMatchReadingDto = ApiSchema<'PalmMatchReadingDto'>;
export type PalmMatchCategory = PalmMatchReadingDto['category'];

/** Deterministic theo (user, category, ngày server UTC) — gọi lại cùng input trong ngày luôn ra
 * cùng kết quả (docs/services/palm-match-service.md), không phải ghép cặp với ai. */
export function useReading(
  category: PalmMatchCategory | null,
  targetName: string,
) {
  return useQuery({
    queryKey: ['palm-match', 'reading', category, targetName],
    queryFn: async () => {
      if (category === null) {
        throw new Error('useReading: category null — enabled phải chặn trước');
      }
      const res = await apiClient.GET('/api/v1/palm-match/reading', {
        params: {
          query: {
            category,
            targetName: targetName === '' ? undefined : targetName,
          },
        },
      });
      return res.data?.data;
    },
    enabled: category !== null,
  });
}
