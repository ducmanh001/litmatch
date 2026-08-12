export interface ImageObjectMetadata {
  sizeBytes: number;
  contentType: string;
}

export abstract class ImageStoragePort {
  abstract generateStorageKey(ownerUserId: string): string;
  /** Deterministic final key; once promoted, the presigned temporary key is no longer public. */
  abstract generateFinalStorageKey(
    ownerUserId: string,
    assetId: string,
  ): string;
  abstract issueUploadUrl(
    storageKey: string,
    contentType: string,
  ): Promise<{ uploadUrl: string; expiresAt: Date }>;
  abstract promote(sourceKey: string, destinationKey: string): Promise<void>;
  abstract delete(storageKey: string): Promise<void>;
  abstract getPublicUrl(storageKey: string): string;
  abstract head(storageKey: string): Promise<ImageObjectMetadata | null>;
  abstract readPrefix(storageKey: string): Promise<Uint8Array | null>;
}
