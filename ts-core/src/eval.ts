import type { Cubeless, Position } from "./types";
import { gameResult } from "./board";

export function cubelessEquity(c: Omit<Cubeless, "equity"> | Cubeless): number {
  return (
    c.win +
    c.gammon +
    c.backgammon -
    ((1 - c.win) + c.loseGammon + c.loseBackgammon)
  );
}

export function makeCubeless(probs: Omit<Cubeless, "equity">): Cubeless {
  return { ...probs, equity: cubelessEquity(probs) };
}

export function cubelessFromVector(vec: ArrayLike<number>): Cubeless {
  return makeCubeless({
    win: vec[0]!,
    gammon: vec[1]!,
    backgammon: vec[2]!,
    loseGammon: vec[3]!,
    loseBackgammon: vec[4]!,
  });
}

/** Exact cubeless probs when 15 are off. Null if the game is still in play. */
export function terminalCubeless(position: Position): Cubeless | null {
  const result = gameResult(position);
  if (!result) return null;
  const stmWon = result.winner === position.onRoll;
  if (stmWon) {
    return makeCubeless({
      win: 1,
      gammon: result.kind === "single" ? 0 : 1,
      backgammon: result.kind === "backgammon" ? 1 : 0,
      loseGammon: 0,
      loseBackgammon: 0,
    });
  }
  return makeCubeless({
    win: 0,
    gammon: 0,
    backgammon: 0,
    loseGammon: result.kind === "single" ? 0 : 1,
    loseBackgammon: result.kind === "backgammon" ? 1 : 0,
  });
}
