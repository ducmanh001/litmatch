export enum ImageAssetPurpose {
  Post = 'post',
  Message = 'message',
  Story = 'story',
}

export enum ImageAssetStatus {
  Pending = 'pending',
  Ready = 'ready',
}

/** Hard cap shared by HTTP validation and runtime config validation. */
export const MAX_IMAGE_UPLOAD_BYTES = 25_000_000;
