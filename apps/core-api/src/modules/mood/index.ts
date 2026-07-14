/**
 * Public API của Mood module — module khác CHỈ import từ đây (arch test enforce).
 */
export { MoodModule } from './mood.module';
export { MoodService } from './mood.service';
export type { CurrentMood } from './mood.service';
export { MoodPreset } from './entities/mood-preset.entity';
