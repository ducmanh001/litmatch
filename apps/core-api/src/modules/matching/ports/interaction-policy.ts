/**
 * Port kiểm tra "2 user này có được phép ghép với nhau không" (block/report lẫn nhau — docs/06).
 *
 * Matcher gọi policy này ĐÚNG TẠI THỜI ĐIỂM GHÉP, trong transaction verify Postgres — không chỉ
 * lúc vào queue (docs/10 § 10.0.C + § 10.2 Matching: trạng thái block có thể đổi giữa lúc ticket
 * nằm chờ). Giai đoạn 4: bind bởi `SafetyModule` qua `useExisting: SafetyService`
 * (docs/services/safety-service.md § 6) — `SafetyService.canPair` thoả mãn interface này bằng
 * structural typing, không cần class adapter riêng.
 */
export const MATCH_INTERACTION_POLICY = Symbol('MATCH_INTERACTION_POLICY');

export interface MatchInteractionPolicy {
  /** true = 2 user được phép ghép (không block/report lẫn nhau trong X ngày — docs/06). */
  canPair(userAId: string, userBId: string): Promise<boolean>;
}
