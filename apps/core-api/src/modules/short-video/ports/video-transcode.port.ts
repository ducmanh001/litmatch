export interface TranscodeResult {
  playbackUrl: string;
  thumbnailUrl: string;
  durationSeconds: number;
}

/**
 * Cổng transcode video — thật (Cloudflare Stream/Mux, ADR sau) là bất đồng bộ thật (webhook khi
 * xong); Dev port ở đây làm ĐỒNG BỘ (trả kết quả ngay) để V1 không cần thêm job/worker riêng —
 * khi thay bằng vendor thật, `VideoService` đổi từ "await xong luôn" sang "chờ webhook" mà
 * không đổi state machine (`processing` vẫn là bước trung gian, chỉ khác thời gian ở lại đó).
 */
export abstract class VideoTranscodePort {
  abstract transcode(storageKey: string): Promise<TranscodeResult>;
}
