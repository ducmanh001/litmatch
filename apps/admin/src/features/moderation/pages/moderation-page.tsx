import { useSearchParams } from 'react-router-dom';

import { Tabs } from '../../../shared/ui/tabs';
import { ReportsPanel } from '../components/reports-panel';
import { SupportTicketsPanel } from '../components/support-tickets-panel';
import {
  PendingVideosPanel,
  PublishedVideosPanel,
} from '../components/video-moderation-panels';

type ModTab = 'reports' | 'pending-videos' | 'published-videos' | 'support';

export function ModerationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab: ModTab =
    requestedTab === 'pending-videos' ||
    requestedTab === 'published-videos' ||
    requestedTab === 'support'
      ? requestedTab
      : 'reports';

  function setTab(nextTab: ModTab): void {
    const next = new URLSearchParams(searchParams);
    if (nextTab === 'reports') next.delete('tab');
    else next.set('tab', nextTab);
    next.delete('case');
    setSearchParams(next);
  }

  return (
    <section>
      <Tabs
        id="moderation"
        tabs={[
          { value: 'reports', label: 'Báo cáo người dùng' },
          { value: 'pending-videos', label: 'Video chờ duyệt' },
          { value: 'published-videos', label: 'Video đã đăng' },
          { value: 'support', label: 'Hỗ trợ' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div
        id={`moderation-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`moderation-tab-${tab}`}
        tabIndex={0}
      >
        {tab === 'reports' && <ReportsPanel />}
        {tab === 'pending-videos' && <PendingVideosPanel />}
        {tab === 'published-videos' && <PublishedVideosPanel />}
        {tab === 'support' && <SupportTicketsPanel />}
      </div>
    </section>
  );
}
