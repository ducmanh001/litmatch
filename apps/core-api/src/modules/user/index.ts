/**
 * Public API của User module — module khác CHỈ được import từ file này,
 * không import thẳng file nội bộ (enforce bằng arch test, xem src/arch/).
 */
export { UserModule } from './user.module';
export { UserService } from './user.service';
export type { CreateUserInput } from './user.service';
export { User, Gender, UserStatus } from './entities/user.entity';
