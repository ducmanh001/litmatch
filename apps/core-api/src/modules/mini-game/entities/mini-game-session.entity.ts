import { Column, Entity } from 'typeorm';

import { BaseAppEntity } from '../../../common/entities/base.entity';
import { MiniGameType, RockPaperScissorsMove } from '../mini-game.constants';

/** Trạng thái ván chơi (docs/services/mini-game-service.md § 2). */
export enum MiniGameSessionStatus {
  WaitingMoves = 'waiting_moves',
  Resolved = 'resolved',
  Cancelled = 'cancelled',
}

/**
 * Ván oẳn tù tì 2 người ĐÃ LÀ BẠN (docs/services/mini-game-service.md). Cặp canonical
 * `userLowId < userHighId` — cùng kỹ thuật `Friendship`/`MovieSession`. Cột đặt tên theo
 * PARTICIPANT (`lowMove`/`highMove`) thay vì "player1/player2" để khỏi mơ hồ ai là ai (spec § 2).
 * `gameType` là varchar — hiện chỉ `rock_paper_scissors`, mở rộng thêm giá trị enum khi có game
 * thứ 2 thay vì đổi cấu trúc bảng.
 *
 * Bất biến DB (migration 1753400000000): 1 user chỉ có 1 MiniGameSession `waiting_moves` tại 1
 * thời điểm, enforce qua bảng phụ trợ `MiniGameActiveParticipant` (PK `userId`) — xem comment ở
 * đó (và ở `MovieSessionActiveParticipant` — cùng kỹ thuật) để biết vì sao KHÔNG dùng 2 partial
 * unique index đơn cột trên `userLowId`/`userHighId`.
 */
@Entity({ name: 'mini_game_sessions' })
export class MiniGameSession extends BaseAppEntity {
  @Column({ type: 'uuid' })
  userLowId!: string;

  @Column({ type: 'uuid' })
  userHighId!: string;

  @Column({
    type: 'varchar',
    length: 32,
    default: MiniGameType.RockPaperScissors,
  })
  gameType!: MiniGameType;

  @Column({ type: 'varchar', length: 16, nullable: true })
  lowMove!: RockPaperScissorsMove | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  highMove!: RockPaperScissorsMove | null;

  @Column({
    type: 'varchar',
    length: 16,
    default: MiniGameSessionStatus.WaitingMoves,
  })
  status!: MiniGameSessionStatus;

  /** null nếu hoà. */
  @Column({ type: 'uuid', nullable: true })
  winnerUserId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;
}
