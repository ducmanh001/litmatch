/**
 * Ngân sách đồng thời DÙNG CHUNG trong một process (admission control cho job nền). Mỗi lần chạy của job cluster-singleton giữ
 * một kết nối pool cho advisory lock cộng thêm kết nối cho task, nên N job nền chạy chồng nhau có thể chiếm hết pool và làm
 * request HTTP chờ kết nối. `tryAcquire` KHÔNG chờ và KHÔNG xếp hàng: hết ngân sách thì tick đó bị bỏ (tick sau thử lại) — hàng
 * đợi luôn có trần bằng 0 nên không thể phình, và việc chậm lại rơi vào job nền chứ không phải request người dùng.
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
