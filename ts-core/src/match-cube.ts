import { MAX_CUBE_VALUE, matchPhase } from "./board";
import { matchEquity } from "./met";
import { CUBE_EFFICIENCY, type CubeView } from "./money";
import type { Cubeless, MatchPhase, Player, Position } from "./types";

/**
 * Live-cube match equity (ADR 0035, docs/domain/match-play.md): Janowski's model carried over to
 * match winning chances. The fully live MWC is piecewise linear in the win chance between the
 * take point and the cash point; those points come from the MET one cube level at a time (a
 * player who owns cube K may redouble to 2K up to 64). The result blends dead and live MWC with
 * cube efficiency x. Gammon rates are fixed as the win chance moves (Janowski's assumption).
 */

type Split = { single: number; gammon: number; backgammon: number };

function split(total: number, gammon: number, backgammon: number): Split {
  if (total <= 0) return { single: 1, gammon: 0, backgammon: 0 };
  const g = Math.max(0, gammon - backgammon) / total;
  const b = Math.max(0, backgammon) / total;
  return { single: Math.max(0, 1 - g - b), gammon: g, backgammon: b };
}

/** Side A is the player whose probabilities these are; O is the opponent. */
class LiveMatch {
  private readonly tp = new Map<string, number>();

  constructor(
    private readonly length: number,
    private readonly scoreA: number,
    private readonly scoreO: number,
    private readonly phase: MatchPhase,
    private readonly aWins: Split,
    private readonly aLoses: Split,
  ) {}

  /** MWC for X (A when `isA`) after X gains `xPts` and the other gains `yPts`. */
  met(isA: boolean, xPts: number, yPts: number): number {
    const [xScore, yScore] = isA ? [this.scoreA, this.scoreO] : [this.scoreO, this.scoreA];
    return matchEquity(this.length - (xScore + xPts), this.length - (yScore + yPts), this.phase);
  }

  /** X's MWC if X wins (W) or loses (L) at cube K, with no further cube action. */
  w(isA: boolean, k: number): number {
    const s = isA ? this.aWins : this.aLoses;
    return s.single * this.met(isA, k, 0) + s.gammon * this.met(isA, 2 * k, 0) + s.backgammon * this.met(isA, 3 * k, 0);
  }

  l(isA: boolean, k: number): number {
    const s = isA ? this.aLoses : this.aWins;
    return s.single * this.met(isA, 0, k) + s.gammon * this.met(isA, 0, 2 * k) + s.backgammon * this.met(isA, 0, 3 * k);
  }

  /** X's win chance at which X, owning cube K, cashes: the other side's take point at 2K. */
  cashPoint(isA: boolean, k: number): number {
    return 1 - this.takePoint(!isA, 2 * k);
  }

  /** Fully live MWC for X owning cube K (X may redouble to 2K while 2K ≤ 64), at win chance q. */
  ownLive(isA: boolean, q: number, k: number): number {
    const lo = this.l(isA, k);
    const hi = this.w(isA, k);
    if (2 * k > MAX_CUBE_VALUE) return lo + q * (hi - lo);
    const cp = this.cashPoint(isA, k);
    const cash = this.met(isA, k, 0);
    if (q < cp) return lo + (cash - lo) * (q / cp);
    return cp >= 1 ? cash : cash + (hi - cash) * ((q - cp) / (1 - cp));
  }

  /** X's take point when doubled to K: the win chance where owning K live equals dropping K/2. */
  takePoint(isA: boolean, k: number): number {
    const key = `${isA ? "a" : "o"}${k}`;
    const known = this.tp.get(key);
    if (known !== undefined) return known;
    const target = this.met(isA, 0, k / 2);
    const lo = this.l(isA, k);
    const hi = this.w(isA, k);
    let q: number;
    if (2 * k > MAX_CUBE_VALUE) {
      q = solve(target, 0, lo, 1, hi);
    } else {
      const cp = this.cashPoint(isA, k);
      const cash = this.met(isA, k, 0);
      q = target <= cash ? solve(target, 0, lo, cp, cash) : solve(target, cp, cash, 1, hi);
    }
    this.tp.set(key, q);
    return q;
  }

  /** Fully live MWC for A at win chance p and cube k, in view `view` (not dead). */
  live(p: number, k: number, view: Exclude<CubeView, "dead">): number {
    if (view === "mine") return this.ownLive(true, p, k);
    if (view === "theirs") return 1 - this.ownLive(false, 1 - p, k);
    const lo = this.l(true, k);
    const hi = this.w(true, k);
    if (2 * k > MAX_CUBE_VALUE) return lo + p * (hi - lo);
    const tp = this.takePoint(true, 2 * k);
    const cp = this.cashPoint(true, k);
    if (tp >= cp) return lo + p * (hi - lo);
    const oppCash = this.met(true, 0, k);
    const cash = this.met(true, k, 0);
    if (p < tp) return lo + (oppCash - lo) * (p / tp);
    if (p <= cp) return oppCash + (cash - oppCash) * ((p - tp) / (cp - tp));
    return cash + (hi - cash) * ((p - cp) / (1 - cp));
  }
}

/** The x on [x0, x1] where the line through (x0, y0) and (x1, y1) reaches y, clamped to [x0, x1]. */
function solve(y: number, x0: number, y0: number, x1: number, y1: number): number {
  if (y1 === y0) return y <= y0 ? x0 : x1;
  const t = (y - y0) / (y1 - y0);
  return x0 + Math.min(1, Math.max(0, t)) * (x1 - x0);
}

function liveMatchFor(c: Cubeless, position: Position, player: Player): LiveMatch {
  if (!position.match) throw new Error("live match cube requires position.match");
  const { length, score } = position.match;
  const other: Player = player === "p1" ? "p2" : "p1";
  return new LiveMatch(
    length,
    score[player],
    score[other],
    matchPhase(position),
    split(c.win, c.gammon, c.backgammon),
    split(1 - c.win, c.loseGammon, c.loseBackgammon),
  );
}

/** Dead-cube MWC: no further cube action at cube k (ts-core deadCubeMwc with fixed gammon rates). */
function deadMwc(m: LiveMatch, p: number, k: number): number {
  return (1 - p) * m.l(true, k) + p * m.w(true, k);
}

/**
 * Cubeful MWC for `player` (whose probs `c` are) at cube `cubeValue` in `view`:
 * `(1 - x) · dead + x · live`, dead when nobody may double.
 */
export function matchCubeful(
  c: Cubeless,
  position: Position,
  player: Player,
  view: CubeView,
  cubeValue: number,
  x = CUBE_EFFICIENCY,
): number {
  const m = liveMatchFor(c, position, player);
  const p = Math.min(1, Math.max(0, c.win));
  const dead = deadMwc(m, p, cubeValue);
  if (view === "dead") return dead;
  return (1 - x) * dead + x * m.live(p, cubeValue, view);
}

export type MatchCubeVerdict = {
  noDouble: number;
  doubleTake: number;
  doubleDrop: number;
  offer: "double" | "no-double";
  take: "take" | "drop";
};

/**
 * The doubler's live-cube match decision (doubler on roll, may double, cube below 64). MWCs are
 * the doubler's: no double, double/take (the taker owns twice the cube; dead at 64), double/drop.
 * Same rule as money: double when min(double/take, double/drop) > no double; take when
 * double/take < double/drop.
 */
export function matchCubeVerdict(
  c: Cubeless,
  position: Position,
  view: "centered" | "mine",
  x = CUBE_EFFICIENCY,
): MatchCubeVerdict {
  const doubler = position.onRoll;
  const value = position.cube.value;
  const noDouble = matchCubeful(c, position, doubler, view, value, x);
  const doubled = 2 * value;
  const doubleTake = matchCubeful(c, position, doubler, doubled >= MAX_CUBE_VALUE ? "dead" : "theirs", doubled, x);
  const doubleDrop = liveMatchFor(c, position, doubler).met(true, value, 0);
  return {
    noDouble,
    doubleTake,
    doubleDrop,
    offer: Math.min(doubleTake, doubleDrop) > noDouble ? "double" : "no-double",
    take: doubleTake < doubleDrop ? "take" : "drop",
  };
}
