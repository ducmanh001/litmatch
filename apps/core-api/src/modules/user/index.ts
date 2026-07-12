/**
 * Public API của User module — module khác CHỈ được import từ file này,
 * không import thẳng file nội bộ (enforce bằng arch test, xem src/arch/).
 */
export { UserModule } from './user.module';
export { UserService } from './user.service';
export type { CreateUserInput } from './user.service';
export { User, Gender, UserStatus } from './entities/user.entity';
// Soul Match trả profile đối phương sau khi match (unlock) — dùng đúng DTO công khai của User,
// không tự chế bản riêng (docs/services/soul-match-service.md § 2)
export { PublicProfileDto } from './dto/user-profile.dto';
