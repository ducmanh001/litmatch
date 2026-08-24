# Coding Standards - LitMatch

## 1. Project Structure & Layer Organization

### Architecture Layers (DDD-inspired)

```
src/
├── modules/                          # Feature modules (domain-driven)
│   ├── auth/
│   │   ├── controllers/              # HTTP endpoints
│   │   ├── services/                 # Business logic
│   │   ├── dtos/                     # Data validation (input/output)
│   │   ├── guards/                   # Route protection (JWT, etc)
│   │   ├── strategies/               # Auth strategies (passport, etc)
│   │   ├── interfaces/               # TS interfaces & types
│   │   ├── constants/                # Module-level constants
│   │   ├── decorators/               # Custom decorators
│   │   ├── middleware/               # Express middleware
│   │   ├── pipes/                    # Custom pipes (validation, transform)
│   │   ├── filters/                  # Exception filters
│   │   ├── entities/                 # Database entities
│   │   ├── repositories/             # Data access layer
│   │   └── auth.module.ts            # Module definition
│   ├── users/
│   │   └── (same structure as auth)
│   └── [feature]/
│       └── (same structure)
├── common/                           # Shared across modules
│   ├── decorators/
│   ├── guards/
│   ├── pipes/
│   ├── filters/
│   ├── interceptors/
│   ├── middleware/
│   ├── constants/                    # Global constants
│   ├── interfaces/                   # Global types
│   ├── utils/                        # Helper functions
│   ├── exceptions/                   # Custom exceptions
│   └── config/                       # Configuration files
├── database/                         # Database layer
│   ├── migrations/
│   ├── seeds/
│   └── data-source.ts               # TypeORM DataSource
└── app.module.ts                     # Root module
```

### Key Principles:

1. **One responsibility per layer:**
   - **Controller**: HTTP routing, validation (via decorators/DTOs), error handling
   - **Service**: Business logic, transactions, orchestration
   - **Repository**: Database queries (if using Repository pattern)
   - **DTO**: Input/output validation schemas only
   - **Entity**: Database schema definition
   - **Interface**: Type contracts (no implementation)
   - **Constant**: Immutable values, config, magic numbers
   - **Guard/Pipe/Filter**: Cross-cutting concerns (auth, validation, errors)

2. **No logic leaks:**
   - Controllers should NOT contain business logic
   - Services should NOT make direct HTTP calls (inject providers)
   - Constants should NOT be scattered in files (centralize in `constants/`)
   - Interfaces should NOT depend on implementations

---

## 2. File Organization Rules

### Controller Files

```typescript
// users.controller.ts
// 1. Imports (NestJS first, then modules)
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { UsersService } from './services/users.service';
import { CreateUserDto } from './dtos/create-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// 2. Decorator stack (most restrictive → most permissive)
@Controller('users')
export class UsersController {
  constructor(
    @Inject(UsersService) private readonly usersService: UsersService,
  ) {}

  // 3. Methods in order: POST, PUT, PATCH, GET (by specificity), DELETE
  @Post()
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.usersService.delete(id);
  }
}
```

**Rules:**

- 1 controller per domain feature (not per HTTP method)
- Keep methods focused on HTTP concerns only
- All business logic → service layer
- All validation → DTOs + pipes
- Controller file name: `<entity>.controller.ts`

### Service Files

```typescript
// services/users.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  // 1. Public methods first
  async create(dto: CreateUserDto): Promise<User> {
    // Business logic here
    return this.usersRepo.save(/* ... */);
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepo.findOne(/* ... */);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // 2. Private helper methods below public ones
  private async hashPassword(password: string): Promise<string> {
    // Implementation
  }
}
```

**Rules:**

- Service name: `<entity>.service.ts`
- 1 service per domain (handles all logic for that domain)
- **Use transactions for multi-step operations** (avatar + user update):
  ```typescript
  async updateWithAvatar(userId: string, updateDto: UpdateUserDto, avatarFile?: AvatarFile) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      // Step 1: Delete old avatar
      if (avatarFile) {
        await this.deleteOldAvatar(userId, queryRunner);
      }
      // Step 2: Save new avatar
      const attachment = await this.saveAvatar(avatarFile, queryRunner);
      // Step 3: Update user
      const user = await queryRunner.manager.update(User, userId, {
        ...updateDto,
        avatar: attachment?.id,
      });
      await queryRunner.commitTransaction();
      return user;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
  ```
- Public methods first, private helpers below
- Handle race conditions with try-catch for unique-violation errors:
  ```typescript
  async follow(followerId: string, followingId: string) {
    try {
      return await this.followsRepo.save({ followerId, followingId });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY' || error.constraint === 'follows_pk') {
        throw new ConflictException('Already following');
      }
      throw error;
    }
  }
  ```

### DTO Files

```typescript
// dtos/create-user.dto.ts
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { i18n } from '../constants/messages.constants';

export class CreateUserDto {
  @IsString({ message: i18n.validation.string })
  @MinLength(3, { message: i18n.validation.minLength })
  @MaxLength(50, { message: i18n.validation.maxLength })
  username: string;

  @IsEmail({}, { message: i18n.validation.email })
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
```

**Rules:**

- DTO file name: `<action>-<entity>.dto.ts` (e.g., `create-user.dto.ts`, `update-user.dto.ts`)
- Use `class-validator` decorators only (no logic)
- Reuse validation messages from constants
- Separate DTOs for different actions (CreateUserDto ≠ UpdateUserDto)

### Entity/Model Files

```typescript
// entities/user.entity.ts
import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column()
  password: string; // hashed

  @CreateDateColumn()
  createdAt: Date;
}
```

**Rules:**

- Entity file name: `<entity>.entity.ts`
- Entity = database schema definition
- No business logic in entities
- Use TypeORM decorators for column constraints

### Interface/Type Files

```typescript
// interfaces/avatar-file.interface.ts
export interface AvatarFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  filename: string;
  path: string;
}
```

**Rules:**

- Interface file name: `<name>.interface.ts`
- 1 interface per file (or closely related ones)
- No implementation code
- Group related interfaces by domain (in module's `interfaces/` folder)
- Global interfaces → `common/interfaces/`

### Constant Files

```typescript
// constants/users.constants.ts
export const SALT_ROUNDS = 10;

export const ALLOWED_AVATAR_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const AVATAR_FILE_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB

export const USER_VALIDATION_MESSAGES = {
  USERNAME_REQUIRED: 'Username is required',
  USERNAME_MIN_LENGTH: 'Username must be at least 3 characters',
  EMAIL_INVALID: 'Email must be valid',
  PASSWORD_MIN_LENGTH: 'Password must be at least 8 characters',
};
```

**Rules:**

- Constant file name: `<entity>.constants.ts`
- ALL magic numbers, strings, arrays → constants file
- Organize by domain (module-level) or globally (common/)
- Use UPPER_SNAKE_CASE for constants
- Group related constants in objects if many

---

## 3. Naming Conventions

### Files & Folders

```
kebab-case
│
├── users.controller.ts           ✓ (not UsersController.ts)
├── users.service.ts              ✓
├── create-user.dto.ts            ✓ (action-entity pattern)
├── user.entity.ts                ✓
├── avatar-file.interface.ts       ✓
├── users.constants.ts            ✓
│
└── user-profile/                 ✓ (feature folder, not UserProfile)
    ├── controllers/
    ├── services/
    └── dtos/
```

### Classes & Exports

```typescript
// PascalCase
export class UsersController {}
export class UsersService {}
export class CreateUserDto {}
export class User {}
export interface AvatarFile {}
```

### Variables & Functions

```typescript
// camelCase
const maxFileSize = 10 * 1024 * 1024;
const allowedMimeTypes = ['image/jpeg', 'image/png'];

async function deleteOldAvatar(userId: string): Promise<void> {}
```

### Constants

```typescript
// UPPER_SNAKE_CASE
const SALT_ROUNDS = 10;
const AVATAR_SIZE_LIMIT = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg'];
```

---

## 4. Module Organization (NestJS)

### Module File Structure

```typescript
// users.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './controllers/users.controller';
import { UsersService } from './services/users.service';
import { User } from './entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // Export if other modules need it
})
export class UsersModule {}
```

**Rules:**

- Module file name: `<entity>.module.ts`
- Imports first (NestJS + database), then controllers, then providers
- Always export services used by other modules
- Each feature = 1 module (auth, users, posts, etc)

---

## 5. Error Handling & Validation

### Validation

```typescript
// Always use class-validator in DTOs
import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  username: string;

  @IsEmail()
  email: string;
}

// Apply validation pipe globally in main.ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);
```

### Exception Handling

```typescript
// Use NestJS built-in exceptions
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';

// In service
async findById(id: string) {
  const user = await this.usersRepo.findOne(id);
  if (!user) throw new NotFoundException('User not found');
  return user;
}

// Handle DB constraint violations
async create(dto: CreateUserDto) {
  try {
    return await this.usersRepo.save(dto);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw new ConflictException('Username or email already exists');
    }
    throw error;
  }
}
```

### Race Condition Protection

```typescript
// Always catch unique-violation errors for concurrent operations
async follow(followerId: string, followingId: string) {
  try {
    return await this.followsRepo.save({ followerId, followingId });
  } catch (error) {
    if (error.constraint === 'follows_pk' || error.code === 'ER_DUP_ENTRY') {
      throw new ConflictException('Already following');
    }
    throw error;
  }
}
```

---

## 6. Database Transactions

### When to Use Transactions

```typescript
// ✓ USE: Multiple operations that must succeed together
async updateUserWithAvatar(userId: string, updateDto: UpdateUserDto, avatarFile: AvatarFile) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // Step 1: Delete old avatar if exists
    await queryRunner.manager.delete(Attachment, { ownerId: userId });

    // Step 2: Save new avatar
    const attachment = await queryRunner.manager.save(Attachment, {
      ownerId: userId,
      fileName: avatarFile.originalname,
      fileSize: avatarFile.size,
      filePath: avatarFile.path,
    });

    // Step 3: Update user with new avatar reference
    await queryRunner.manager.update(User, userId, {
      ...updateDto,
      avatarId: attachment.id,
    });

    await queryRunner.commitTransaction();
    return { success: true };
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

// ✗ DON'T USE: Single operation
async create(dto: CreateUserDto) {
  return this.usersRepo.save(dto); // No transaction needed
}
```

---

## 7. Security Best Practices

### File Uploads

```typescript
// Always validate MIME type + extension
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

fileFilter: (req, file, callback) => {
  const ext = extname(file.originalname).toLowerCase();

  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return callback(new BadRequestException('Invalid file type'), false);
  }

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return callback(new BadRequestException('Invalid file extension'), false);
  }

  callback(null, true);
};
```

### Authentication

```typescript
// Private endpoints must use JwtAuthGuard
@Controller('attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  @Get(':id')
  getFile(@Param('id') id: string) {
    // Only authenticated users can access
  }
}

// Public endpoints use OptionalJwtAuthGuard if needed
@Controller('profiles')
@UseGuards(OptionalJwtAuthGuard)
export class ProfilesController {
  @Get(':username')
  getProfile(@Param('username') username: string) {
    // Works with or without auth
  }
}
```

---

## 8. Code Quality Checklist

Before committing, ensure:

- [ ] **One responsibility per file** - each file has one clear purpose
- [ ] **No logic in controllers** - all business logic in services
- [ ] **Constants centralized** - no magic numbers scattered in code
- [ ] **Types defined** - use interfaces for type contracts
- [ ] **DTOs validate input** - class-validator decorators cover all fields
- [ ] **Transactions used** - multi-step operations wrapped in transactions
- [ ] **Race conditions handled** - concurrent operations catch constraint violations
- [ ] **Security checked** - file uploads validated, auth guards used
- [ ] **Error messages clear** - exceptions include context (not generic "error")
- [ ] **No commented code** - dead code deleted, not left in comments
- [ ] **Dependencies injected** - no hardcoded dependencies
- [ ] **Tests exist** - critical paths have unit tests
- [ ] **Linting passes** - `npm run lint` and `npm run lint:sunlint`

---

## 9. Example: Proper Module Implementation

### ✓ CORRECT: Users Module

```
src/modules/users/
├── controllers/
│   └── users.controller.ts
├── services/
│   └── users.service.ts
├── dtos/
│   ├── create-user.dto.ts
│   └── update-user.dto.ts
├── entities/
│   └── user.entity.ts
├── interfaces/
│   └── avatar-file.interface.ts
├── constants/
│   └── users.constants.ts
├── guards/                (if any module-specific guards)
├── pipes/                 (if any module-specific pipes)
└── users.module.ts
```

### ✗ WRONG: Avoid

```
src/
├── UserController.ts            (PascalCase filename)
├── UserService.ts               (mixed concerns in 1 folder)
├── users.ts                     (vague name)
├── user_controller.ts           (snake_case)
├── folder_with_underscore/      (underscore in folder)
└── controllers/
    ├── User.controller.ts       (PascalCase)
    ├── Post.controller.ts
    └── Comment.controller.ts    (all controllers in 1 folder = unclear ownership)
```

---

## 10. Git Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Examples

```
feat(users): add avatar upload with transaction

- Extract AvatarFile interface for type safety
- Move avatar logic to UsersService.updateWithAvatar()
- Wrap avatar save + user update in database transaction
- Simplify controller to just call service method

Closes #123

---

fix(users): handle empty PATCH body and race conditions

- Guard updateById against empty patch body to avoid crash
- Catch unique-violation on follow() to prevent 500 errors
- Differentiate unique-violation messages by constraint name

---

refactor(users): extract constants and interfaces

- Move SALT_ROUNDS, ALLOWED_AVATAR_MIME_TYPES to constants file
- Move AvatarFile interface to interfaces/ folder
- Follow NestJS module structure conventions
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

---

## Summary

This is a **clean, scalable architecture** that:

- ✓ Separates concerns (controller ≠ service ≠ entity)
- ✓ Centralizes constants + interfaces
- ✓ Handles race conditions + transactions
- ✓ Validates input + security
- ✓ Follows NestJS conventions
- ✓ Makes code easy to test + maintain

**When in doubt:** Put it in a service, validate it in a DTO, document it in a constant.
