import { VideoTranscodePort } from './video-transcode.port';

import { VIDEO_PROVIDER_UNAVAILABLE_MESSAGE } from '../short-video.constants';

/** Fail-closed adapter cho production view-only khi chưa có transcode provider thật. */
export class UnavailableVideoTranscodeAdapter extends VideoTranscodePort {
  async transcode(storageKey: string): Promise<never> {
    void storageKey;
    throw new Error(`${VIDEO_PROVIDER_UNAVAILABLE_MESSAGE}: transcode`);
  }
}
