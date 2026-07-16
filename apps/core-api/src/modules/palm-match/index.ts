/**
 * Public API của Palm Match module — module khác CHỈ import từ đây (arch test enforce).
 */
export { PalmMatchModule } from './palm-match.module';
export {
  PalmMatchOutcome,
  PalmMatchRating,
  PalmMatchSessionStatus,
} from './entities/palm-match-session.entity';
export { PalmMatchService } from './palm-match.service';

export type { PalmMatchReading } from './palm-match.service';
