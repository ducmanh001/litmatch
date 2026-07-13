/** Hằng số/type/logic thuần dùng bởi ≥2 file trong module (docs/05 § 5.1). */

/** Game duy nhất ở bản này (docs/services/mini-game-service.md § 0) — mở rộng khi có game thứ 2. */
export enum MiniGameType {
  RockPaperScissors = 'rock_paper_scissors',
}

/** Nước đi hợp lệ của `rock_paper_scissors`. */
export enum RockPaperScissorsMove {
  Rock = 'rock',
  Paper = 'paper',
  Scissors = 'scissors',
}

/** Bên nào của session thắng — `draw` khi 2 move giống nhau. */
export type RockPaperScissorsOutcome = 'low' | 'high' | 'draw';

/**
 * Luật oẳn tù tì: rock > scissors > paper > rock (docs/services/mini-game-service.md § 3).
 * Hàm THUẦN, không phụ thuộc DB/repo — tách riêng khỏi service để mở rộng game thứ 2 sau này
 * không phải nhét if/else theo `gameType` vào service chung (docs/10 § Mini Game — "God Service").
 */
export function resolveWinner(
  lowMove: RockPaperScissorsMove,
  highMove: RockPaperScissorsMove,
): RockPaperScissorsOutcome {
  if (lowMove === highMove) return 'draw';

  const beats: Record<RockPaperScissorsMove, RockPaperScissorsMove> = {
    [RockPaperScissorsMove.Rock]: RockPaperScissorsMove.Scissors,
    [RockPaperScissorsMove.Scissors]: RockPaperScissorsMove.Paper,
    [RockPaperScissorsMove.Paper]: RockPaperScissorsMove.Rock,
  };
  return beats[lowMove] === highMove ? 'low' : 'high';
}
