/**
 * Cổng lưu trữ video — thật (Cloudflare Stream/Mux, ADR sau khi có bảng giá cụ thể) cắm vào ở
 * giai đoạn sau. Body video KHÔNG BAO GIỜ chạm NestJS — client upload thẳng lên storage qua
 * `uploadUrl` presigned; server chỉ biết `storageKey` để tra cứu sau.
 *
 * Tách sinh `storageKey` (pure, không I/O) khỏi `issueUploadUrl` (có I/O, có thể gọi LẠI cho
 * CÙNG 1 storageKey) — đây là điều kiện để idempotent-replay của `createUploadIntent` phát lại
 * ĐÚNG URL cho video đã tạo thay vì phải bịa 1 key mới không ai dùng.
 */
export abstract class VideoStoragePort {
  abstract generateStorageKey(authorUserId: string): string;
  abstract issueUploadUrl(storageKey: string): Promise<string>;
  abstract getPlaybackUrl(storageKey: string): Promise<string>;
  abstract getThumbnailUrl(storageKey: string): Promise<string>;
  /** Idempotent cleanup cho object mồ côi sau upload bỏ dở hoặc xử lý thất bại. */
  abstract delete(storageKey: string): Promise<void>;
}
