import { Column, Entity, Index } from 'typeorm';

import { BaseAppEntity } from '../../../common/entities/base.entity';

/** Nguồn tạo quan hệ bạn — cả 2 "Thích" sau Soul/Voice/Palm/Movie Match (docs/02). */
export enum FriendshipSource {
  SoulMatch = 'soul_match',
  VoiceMatch = 'voice_match',
  PalmMatch = 'palm_match',
  MovieMatch = 'movie_match',
}

/**
 * Quan hệ bạn bè 2 CHIỀU lưu đúng 1 dòng theo cặp canonical `userLowId < userHighId`
 * (so sánh chuỗi uuid) — unique DB trên cặp là chốt chặn cuối chống tạo đôi khi
 * 2 rating "like" chạy song song (docs/services/soul-match-service.md § 3).
 * Đây cũng là nguồn sự thật của "unlock profile".
 */
@Entity({ name: 'friendships' })
@Index('uq_friendships_pair', ['userLowId', 'userHighId'], { unique: true })
export class Friendship extends BaseAppEntity {
  @Column({ type: 'uuid' })
  userLowId!: string;

  @Column({ type: 'uuid' })
  userHighId!: string;

  @Column({ type: 'varchar', length: 16 })
  source!: FriendshipSource;
}
