import type { ReactNode } from 'react';

export function JsonLd({ data }: { data: unknown }): ReactNode {
  return <script type="application/ld+json">{JSON.stringify(data)}</script>;
}
