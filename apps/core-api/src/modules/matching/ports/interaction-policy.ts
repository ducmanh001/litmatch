/**
 * Port kiểm tra "2 user này có được phép ghép với nhau không" (block/report lẫn nhau — docs/06).
 *
 * Matcher gọi policy này ĐÚNG TẠI THỜI ĐIỂM GHÉP, trong transaction verify Postgres — không chỉ
 * lúc vào queue (docs/10 § 10.0.C + § 10.2 Matching: trạng thái block có thể đổi giữa lúc ticket
 * nằm chờ). Module Safety (block/report) là mục roadmap riêng, CHƯA tồn tại trong slice M1 —
 * default bind AllowAllInteractionPolicy; khi Safety module ra đời, nó cung cấp implementation
 * thật qua DI (override provider MATCH_INTERACTION_POLICY), matcher không phải sửa.
 */
export const MATCH_INTERACTION_POLICY = Symbol('MATCH_INTERACTION_POLICY');

export interface MatchInteractionPolicy {
  /** true = 2 user được phép ghép (không block/report lẫn nhau trong X ngày — docs/06). */
  canPair(userAId: string, userBId: string): Promise<boolean>;
}

/** Default khi chưa có Safety module — cho phép tất cả (chưa có dữ liệu block/report để tra). */
export class AllowAllInteractionPolicy implements MatchInteractionPolicy {
  async canPair(): Promise<boolean> {
    return true;
  }
}
