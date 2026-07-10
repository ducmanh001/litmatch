import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum Gender {
  Unknown = 'unknown',
  Male = 'male',
  Female = 'female',
  Other = 'other',
}

export enum UserStatus {
  Active = 'active',
  Banned = 'banned',
}

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 50 })
  nickname!: string;

  @Column({ length: 10, default: Gender.Unknown })
  gender!: Gender;

  @Column({ type: 'date', nullable: true })
  birthDate!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  region!: string | null;

  @Column({ length: 64 })
  avatarId!: string;

  /** Điểm tin cậy nội bộ cho matching priority (docs/06) — không expose ra API. */
  @Column({ type: 'int', default: 100 })
  trustScore!: number;

  @Column({ length: 16, default: UserStatus.Active })
  status!: UserStatus;

  @Column({ default: false })
  isGuest!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
