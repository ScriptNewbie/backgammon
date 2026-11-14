import { MAX_CUBE_VALUE } from "./board";
import type { Cubeless, Player, Position } from "./types";

/**
 * Money-play cube (ADR 0034, docs/domain/money-play.md): Janowski's live-cube model with cube
 * efficiency x. Jacoby off, no beavers. Browser-safe (no MET, no Node APIs).
 */
export const CUBE_EFFICIENCY = 0.68;

/** Who may turn the cube, from one player's side. `dead`: nobody may (Crawford-like, cube at 64). */
export type CubeView = "centered" | "mine" | "theirs" | "dead";

/** The cube from `player`'s side, read from `mayDouble` (the source of truth for who may double). */
export function cubeView(position: Position, player: Player): CubeView {
  const other: Player = player === "p1" ? "p2" : "p1";
  const me = position.cube.mayDouble[player];
  const them = position.cube.mayDouble[other];
  if (me && them) return "centered";
  if (me) return "mine";
  if (them) return "theirs";
  return "dead";
}

/** W (points per win) and L (points per loss) at cube 1. */
function winLoss(c: Cubeless): { p: number; W: number; L: number } {
  const p = Math.min(1, Math.max(0, c.win));
  const lose = 1 - p;
  const W = p > 0 ? (c.win + c.gammon + c.backgammon) / c.win : 1;
  const L = lose > 0 ? (lose + c.loseGammon + c.loseBackgammon) / lose : 1;
  return { p, W, L };
}

/** Fully live-cube equity at cube 1 (piecewise linear in p). */
function liveEquity(c: Cubeless, view: Exclude<CubeView, "dead">): number {
  const { p, W, L } = winLoss(c);
  const tp = (L - 0.5) / (W + L + 0.5);
  const cp = (L + 1) / (W + L + 0.5);
  const above = (from: number, at: number) => from + (W - from) * ((p - at) / (1 - at));
  if (view === "mine") return p < cp ? -L + (L + 1) * (p / cp) : above(1, cp);
  if (view === "theirs") return p < tp ? -L + (L - 1) * (p / tp) : above(-1, tp);
  if (p < tp) return -L + (L - 1) * (p / tp);
  if (p <= cp) return -1 + 2 * ((p - tp) / (cp - tp));
  return above(1, cp);
}

/** Cubeful money equity for the player whose probs `c` are, in points at `cubeValue`. */
export function moneyCubeful(c: Cubeless, view: CubeView, cubeValue: number, x = CUBE_EFFICIENCY): number {
  const dead = c.equity;
  if (view === "dead") return dead * cubeValue;
  return cubeValue * ((1 - x) * dead + x * liveEquity(c, view));
}

export type MoneyCubeVerdict = {
  noDouble: number;
  doubleTake: number;
  doubleDrop: number;
  offer: "double" | "no-double";
  take: "take" | "drop";
};

/**
 * The doubler's money cube decision (doubler on roll, may double, cube below 64). Equities are
 * the doubler's, in points: no double at the current cube, double/take (the taker then owns a
 * cube at twice the value, dead at 64), double/drop (+cube).
 */
export function moneyCubeVerdict(c: Cubeless, view: "centered" | "mine", cubeValue: number, x = CUBE_EFFICIENCY): MoneyCubeVerdict {
  const noDouble = moneyCubeful(c, view, cubeValue, x);
  const doubled = 2 * cubeValue;
  const doubleTake = moneyCubeful(c, doubled >= MAX_CUBE_VALUE ? "dead" : "theirs", doubled, x);
  const doubleDrop = cubeValue;
  return {
    noDouble,
    doubleTake,
    doubleDrop,
    offer: Math.min(doubleTake, doubleDrop) > noDouble ? "double" : "no-double",
    take: doubleTake < doubleDrop ? "take" : "drop",
  };
}
