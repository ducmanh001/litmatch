import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';

import { apiClient } from '../api/client';
import { useT } from '../i18n/catalog';
import { LoadingState } from '../ui/states';
import { useSessionStatus } from './use-session';

/** Restore access token trước khi bất kỳ route protected nào được render. */
export function SessionBootstrap() {
  const status = useSessionStatus();
  const t = useT();

  useEffect(() => {
    if (status === 'restorable') void apiClient.restoreSession();
  }, [status]);

  if (status === 'restorable') {
    return <LoadingState label={t('state.restoringSession')} />;
  }
  return <Outlet />;
}
