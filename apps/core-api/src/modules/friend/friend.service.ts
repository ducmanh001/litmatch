import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { Friendship, FriendshipSource } from './entities/friendship.entity';

/** Kết quả tạo quan hệ — `created=false` nghĩa là cặp đã là bạn từ trước (idempotent). */
export interface EnsureFriendshipResult {
  created: boolean;
}

/**
 * Facade của Friend module — slice tối thiểu cho Soul Match (docs/07-roadmap.md):
 * chỉ tạo + tra cứu Friendship. Friend Chat 1-1 (`Conversation`/`Message`) là mục
 * roadmap riêng, xây tiếp trên module này khi tới lượt — KHÔNG scaffold trước.
 */
@Injectable()
export class FriendService {
  constructor(
    @InjectRepository(Friendship)
    private readonly friendshipRepo: Repository<Friendship>,
  ) {}

  /**
   * Tạo quan hệ bạn nếu chưa có — idempotent bằng `ON CONFLICT DO NOTHING` trên cặp
   * canonical (cặp cũ match lại lần 2 không vỡ — docs/10 § Soul Match). Nhận
   * EntityManager để caller (Soul Match) gói trong CÙNG transaction với insert rating
   * (cùng pattern UserService.createWithManager — docs/03 § 3.7).
   */
  async ensureFriendship(
    manager: EntityManager,
    userAId: string,
    userBId: string,
    source: FriendshipSource,
  ): Promise<EnsureFriendshipResult> {
    if (userAId === userBId) {
      throw new Error(
        `Không thể tạo friendship với chính mình (${userAId}) — dữ liệu session hỏng`,
      );
    }
    const [userLowId, userHighId] = canonicalPair(userAId, userBId);
    const result = await manager
      .createQueryBuilder()
      .insert()
      .into(Friendship)
      .values({ userLowId, userHighId, source })
      .orIgnore()
      .execute();
    // ON CONFLICT DO NOTHING → RETURNING rỗng khi dòng đã tồn tại
    return { created: result.raw.length > 0 };
  }

  async areFriends(userAId: string, userBId: string): Promise<boolean> {
    if (userAId === userBId) return false;
    const [userLowId, userHighId] = canonicalPair(userAId, userBId);
    return this.friendshipRepo.exists({ where: { userLowId, userHighId } });
  }
}

/** Chuẩn hoá cặp 2 chiều về (low, high) theo so sánh chuỗi uuid — 1 quan hệ chỉ có 1 dòng. */
export function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}
