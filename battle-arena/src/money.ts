import { randomUUID } from "node:crypto";
import type { SgfGame } from "ts-core";
import { renderMatchSgf } from "ts-core/sgf";
import { playGame, type MatchPlayer, type Rng } from "ts-core/sim";
import type { MoneyGameRow } from "./summary";

/**
 * A money session (ADR 0034): independent money games, Jacoby off, no beavers. Seats alternate
 * each game (side A is p1 in even games). The SGF holds every game so far, with `MI[length:0]`
 * and each seat's running points in `ws` / `bs`.
 */
export async function playMoneyGame(opts: {
  rng: Rng;
  sessionId: string;
  gameIndex: number;
  aSeat: "p1" | "p2";
  players: { p1: MatchPlayer; p2: MatchPlayer };
  labels: { p1: string; p2: string };
  /** Running points per seat before this game (SGF headers only). */
  running: { p1: number; p2: number };
  allowCube: boolean;
}): Promise<{ row: MoneyGameRow; game: SgfGame; points: number; winnerSeat: "p1" | "p2" }> {
  const result = await playGame({
    rng: opts.rng,
    players: opts.players,
    matchId: opts.sessionId,
    length: 0,
    score: { p1: 0, p2: 0 },
    phase: "pre",
    gameIndex: opts.gameIndex,
    allowCube: opts.allowCube,
    money: true,
  });
  const points = result.cubeValue * result.result.multiplier;
  const winnerSeat = result.result.winner;
  const aWon = winnerSeat === opts.aSeat;
  return {
    row: { aSeat: opts.aSeat, winner: aWon ? "a" : "b", aPoints: aWon ? points : -points },
    game: {
      length: 0,
      gameIndex: opts.gameIndex,
      ws: opts.running.p1,
      bs: opts.running.p2,
      p1: opts.labels.p1,
      p2: opts.labels.p2,
      phase: "pre",
      events: result.events,
      result: { winner: winnerSeat, points },
    },
    points,
    winnerSeat,
  };
}

export function moneySessionId(): string {
  return randomUUID();
}

export function renderMoneySgf(games: readonly SgfGame[]): string {
  return renderMatchSgf(games, { app: "battle-arena:1" });
}
