import { useState } from 'react';

import { Tabs } from '../../../shared/ui/tabs';
import { ReportsPanel } from '../components/reports-panel';
import { SupportTicketsPanel } from '../components/support-tickets-panel';
import {
  PendingVideosPanel,
  PublishedVideosPanel,
} from '../components/video-moderation-panels';

type ModTab = 'reports' | 'pending-videos' | 'published-videos' | 'support';

export function ModerationPage() {
  const [tab, setTab] = useState<ModTab>('reports');

  return (
    <section>
      <Tabs
        tabs={[
          { value: 'reports', label: 'Báo cáo người dùng' },
          { value: 'pending-videos', label: 'Video chờ duyệt' },
          { value: 'published-videos', label: 'Video đã đăng' },
          { value: 'support', label: 'Hỗ trợ' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'reports' && <ReportsPanel />}
      {tab === 'pending-videos' && <PendingVideosPanel />}
      {tab === 'published-videos' && <PublishedVideosPanel />}
      {tab === 'support' && <SupportTicketsPanel />}
    </section>
  );
}
