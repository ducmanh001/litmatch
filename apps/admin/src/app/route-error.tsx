import { useRouteError } from 'react-router-dom';

import { ErrorState } from '../shared/ui/states';

/** Error boundary cấp route (docs/13 § 13.7) — 1 màn vỡ không kéo sập cả app. */
export function RouteError() {
  const error = useRouteError();
  return <ErrorState error={error} />;
}
