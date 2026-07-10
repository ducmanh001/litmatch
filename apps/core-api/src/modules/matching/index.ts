/**
 * Public API của Matching module — module khác CHỈ import từ đây.
 * MatcherWorkerService/TicketSweeperService KHÔNG export: là job nội bộ,
 * không service nào bên ngoài cần gọi trực tiếp.
 */
export { MatchingModule } from './matching.module';
export { MatchingService } from './matching.service';
export type { MatchTicketView } from './matching.service';
export { MatchType, MatchTicketStatus } from './entities/match-ticket.entity';
export type { MatchCriteria } from './entities/match-ticket.entity';
export { MatchSessionStatus } from './entities/match-session.entity';
