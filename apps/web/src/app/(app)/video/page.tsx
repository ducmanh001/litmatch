import { VideoReelFeed } from '../../../features/short-video/components/video-reel-feed';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Video' };

export default function VideoPage() {
  return (
    <section>
      <VideoReelFeed />
    </section>
  );
}
