/**
 * Cổng "một lần mỗi cửa sổ thời gian" cho tín hiệu phụ có thể gộp (vd thông báo tin nhắn). Chỉ là
 * trạng thái tạm để giảm tải — KHÔNG phải nguồn sự thật: mất state chỉ làm thông báo dư, không làm
 * mất dữ liệu nghiệp vụ, nên caller được phép fail-open khi cổng lỗi.
 */
export interface WindowGatePort {
  /** `true` = lần đầu trong cửa sổ (caller làm việc); `false` = đã có trong cửa sổ (bỏ qua). */
  tryAcquire(key: string, windowSeconds: number): Promise<boolean>;
  /** Mở lại cổng sớm khi việc đáng ra làm trong cửa sổ đã không xảy ra (best-effort). */
  release(key: string): Promise<void>;
  /** Optional lifecycle hook for adapters that own a shared transport client. */
  close?(): Promise<void>;
}
