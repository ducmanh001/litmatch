export type VideoCounterField = 'view' | 'like' | 'comment';

export interface VideoCounterDeltas {
  videoId: string;
  views: number;
  likes: number;
  comments: number;
}

/**
 * Bộ đệm counter (view/like/comment) của video — gom nhiều lượt tăng/giảm trên cùng một video thành MỘT
 * câu UPDATE định kỳ, để video viral không thành hàng nóng trong `videos` (ADR 0013, plan § 7a).
 * Counter chỉ là cache đọc nhanh, không phải nguồn sự thật; mất delta chỉ làm số đếm lệch nhẹ.
 * `enabled=false` (mặc định) → service cộng thẳng vào DB trong transaction như trước.
 */
export abstract class VideoCounterBufferPort {
  abstract readonly enabled: boolean;
  /** Ném lỗi khi backend lỗi — caller fail-open (cộng thẳng vào DB). */
  abstract add(
    videoId: string,
    field: VideoCounterField,
    delta: number,
  ): Promise<void>;
  /** Lấy tối đa `limit` video có delta chờ flush và đặt lại về 0 nguyên tử. */
  abstract drain(limit: number): Promise<VideoCounterDeltas[]>;
  /** Cộng lại delta đã drain nhưng flush DB lỗi (không để mất). */
  abstract restore(items: readonly VideoCounterDeltas[]): Promise<void>;
  close?(): Promise<void>;
}
