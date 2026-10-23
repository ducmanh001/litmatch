/**
 * Ngân sách đồng thời dùng chung giữa các caller giữ cùng instance trong một process.
 * `tryAcquire` không chờ và không xếp hàng: HTTP caller trả 503 khi hết chỗ;
 * job nền bỏ tick và thử lại sau. Job cluster-singleton còn giữ kết nối cho
 * advisory lock, vì vậy ngân sách của job phải dành chỗ cho cả lock và task.
 */
export class ConcurrencyBudget {
  private inFlight = 0;

  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error(`ConcurrencyBudget limit không hợp lệ: ${limit}`);
    }
  }

  get inUse(): number {
    return this.inFlight;
  }

  /** Trả hàm nhả (idempotent) nếu còn chỗ, `undefined` nếu đã đủ `limit` tác vụ đang chạy. */
  tryAcquire(): (() => void) | undefined {
    if (this.inFlight >= this.limit) return undefined;
    this.inFlight += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.inFlight -= 1;
    };
  }
}
