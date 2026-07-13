import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';

import { MiniGameSessionStatus } from '../entities/mini-game-session.entity';
import { MiniGameType, RockPaperScissorsMove } from '../mini-game.constants';

import type { MiniGameSession } from '../entities/mini-game-session.entity';

export class CreateMiniGameSessionDto {
  @ApiProperty({
    description: 'userId của bạn muốn chơi cùng — phải đã là bạn',
  })
  @IsUUID()
  friendUserId!: string;

  @ApiProperty({ enum: MiniGameType, default: MiniGameType.RockPaperScissors })
  @IsEnum(MiniGameType)
  gameType!: MiniGameType;
}

export class SubmitMiniGameMoveDto {
  @ApiProperty({ enum: RockPaperScissorsMove })
  @IsEnum(RockPaperScissorsMove)
  move!: RockPaperScissorsMove;
}

/**
 * Response cho `GET /mini-game/sessions/:id` VÀ `POST /mini-game/sessions/:id/moves`
 * (spec § 3, § 4). TUYỆT ĐỐI KHÔNG có field `opponentMove` khi `status !== 'resolved'` — chỉ
 * `resolved` mới trả `opponentMove` (map lại từ `lowMove`/`highMove` theo caller). Field
 * `opponentHasMoved` là boolean THUẦN (không lộ move đối phương là gì, chỉ báo đã nộp hay chưa).
 */
export class MiniGameSessionDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    description: 'userId của người bạn còn lại trong ván (không phải caller)',
  })
  partnerUserId!: string;
  @ApiProperty() gameType!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true, type: String })
  myMove!: RockPaperScissorsMove | null;
  @ApiProperty() opponentHasMoved!: boolean;
  @ApiProperty({ nullable: true, type: String, required: false })
  opponentMove?: RockPaperScissorsMove | null;
  @ApiProperty({ nullable: true, type: String })
  winnerUserId!: string | null;
  @ApiProperty({ nullable: true, type: Date })
  resolvedAt!: Date | null;

  static from(
    session: MiniGameSession,
    callerUserId: string,
  ): MiniGameSessionDto {
    const isLow = session.userLowId === callerUserId;
    const myMove = isLow ? session.lowMove : session.highMove;
    const opponentMoveRaw = isLow ? session.highMove : session.lowMove;

    const dto = new MiniGameSessionDto();
    dto.id = session.id;
    dto.partnerUserId = isLow ? session.userHighId : session.userLowId;
    dto.gameType = session.gameType;
    dto.status = session.status;
    dto.myMove = myMove;
    dto.opponentHasMoved = opponentMoveRaw !== null;
    dto.winnerUserId = session.winnerUserId;
    dto.resolvedAt = session.resolvedAt;

    // Chỉ set (và chỉ serialize — @ApiProperty required:false) field opponentMove khi ĐÃ resolve.
    // Trước đó KHÔNG set field này (undefined), JSON.stringify() sẽ bỏ hẳn key ra khỏi payload
    // thay vì trả null — tránh mọi khả năng client/log suy luận nhầm "null nghĩa là chưa nộp".
    if (session.status === MiniGameSessionStatus.Resolved) {
      dto.opponentMove = opponentMoveRaw;
    }
    return dto;
  }
}
