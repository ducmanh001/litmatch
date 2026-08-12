import { putPresignedFile } from '@litmatch/api-client';

import { apiClient } from '../api/client';

export type ImageUploadPurpose = 'post' | 'message' | 'story';

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Xin presigned URL từ core-api rồi PUT thẳng file vào object storage.
 * PUT file dùng transport chung của api-client tới URL storage đã ký; không gọi REST
 * core-api trực tiếp ngoài apiClient.
 */
export async function uploadImage(
  file: File,
  purpose: ImageUploadPurpose,
): Promise<{ assetId: string; publicUrl: string }> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Chỉ hỗ trợ JPG, PNG, WEBP hoặc GIF.');
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    throw new Error('Ảnh phải có dung lượng tối đa 10MB.');
  }

  const intentResponse = await apiClient.POST(
    '/api/v1/media/images/upload-intent',
    {
      body: {
        purpose,
        contentType: file.type,
        sizeBytes: file.size,
      },
    },
  );
  const intent = intentResponse.data?.data;
  if (!intent) throw new Error('Không tạo được phiên upload ảnh.');

  await putPresignedFile({
    uploadUrl: intent.uploadUrl,
    file,
    contentType: file.type,
  });

  return { assetId: intent.assetId, publicUrl: intent.publicUrl };
}
