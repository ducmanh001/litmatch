import { VideoStoragePort } from './video-storage.port';

import { VIDEO_PROVIDER_UNAVAILABLE_MESSAGE } from '../short-video.constants';

/** Fail-closed adapter cho production view-only khi chưa có storage provider thật. */
export class UnavailableVideoStorageAdapter extends VideoStoragePort {
  generateStorageKey(authorUserId: string): string {
    void authorUserId;
    return this.unavailable('generateStorageKey');
  }

  async issueUploadUrl(storageKey: string): Promise<string> {
    void storageKey;
    return this.unavailable('issueUploadUrl');
  }

  async getPlaybackUrl(storageKey: string): Promise<string> {
    void storageKey;
    return this.unavailable('getPlaybackUrl');
  }

  async getThumbnailUrl(storageKey: string): Promise<string> {
    void storageKey;
    return this.unavailable('getThumbnailUrl');
  }

  async delete(storageKey: string): Promise<void> {
    void storageKey;
    return this.unavailable('delete');
  }

  private unavailable(operation: string): never {
    throw new Error(
      `${VIDEO_PROVIDER_UNAVAILABLE_MESSAGE}: storage.${operation}`,
    );
  }
}
