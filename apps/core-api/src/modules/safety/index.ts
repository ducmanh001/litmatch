/**
 * Public API của Safety module — module khác CHỈ import từ đây (arch test enforce).
 */
export { SafetyModule } from './safety.module';
export { SafetyService } from './safety.service';
export type { ReportPageFilter, ReportPage } from './safety.service';
export { Report, ReportReason, ReportStatus } from './entities/report.entity';
export { Block, BlockAction } from './entities/block.entity';
