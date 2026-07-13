/**
 * Public API của Matching module — module khác CHỈ import từ đây (arch test enforce).
 * Soul Match dùng: đọc session (read-only) + lock row session để serialize rating
 * (docs/services/soul-match-service.md § 3) — quyền GHI session vẫn thuộc riêng Matching.
 */
export { MatchingModule } from './matching.module';
export { MatchingService } from './matching.service';
export {
  MatchSession,
  MatchSessionStatus,
} from './entities/match-session.entity';
export { MatchType } from './entities/match-ticket.entity';
// Safety module bind implementation thật vào token này (docs/services/safety-service.md § 6)
export {
  MATCH_INTERACTION_POLICY,
  MatchInteractionPolicy,
} from './ports/interaction-policy';
