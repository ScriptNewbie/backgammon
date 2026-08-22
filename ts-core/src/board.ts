import type { MatchPhase, Player, Position, Step } from "./types";

/** Physical / GNU–XG–FIBS cube. Doubling past this is illegal. */
export const MAX_CUBE_VALUE = 64;

/** Standard opening. Index 0 = point 1. Positive = p1. */
export const OPENING_POINTS: readonly number[] = [
  -2, 0, 0, 0, 0, 5, 0, 3, 0, 0, 0, -5, 5, 0, 0, 0, -3, 0, -5, 0, 0, 0, 0, 2,
];

export function opponent(player: Player): Player {
  return player === "p1" ? "p2" : "p1";
}

export function clonePosition(position: Position): Position {
  return structuredClone(position);
}

export function openingPosition(
  length: number,
  score: { p1: number; p2: number },
  phase: MatchPhase,
): Position {
  const crawford = phase === "crawford";
  return {
    points: [...OPENING_POINTS],
    bar: { p1: 0, p2: 0 },
    off: { p1: 0, p2: 0 },
    onRoll: "p1",
    dice: null,
    cube: {
      value: 1,
      owner: "centered",
      mayDouble: crawford
        ? { p1: false, p2: false }
        : { p1: true, p2: true },
    },
    match: {
      length,
      score: { p1: score.p1, p2: score.p2 },
      crawford,
    },
  };
}

export function checkerCount(position: Position, player: Player): number {
  let n = position.bar[player] + position.off[player];
  for (const v of position.points) {
    if (player === "p1" && v > 0) n += v;
    if (player === "p2" && v < 0) n += -v;
  }
  return n;
}

export function assertFifteen(position: Position): void {
  const p1 = checkerCount(position, "p1");
  const p2 = checkerCount(position, "p2");
  if (p1 !== 15 || p2 !== 15) {
    throw new Error(`checker counts must be 15 (p1=${p1} p2=${p2})`);
  }
}

export function stepsKey(steps: readonly Step[]): string {
  return steps.map((s) => `${s.from}/${s.to}`).join(" ");
}

function pointIndex(point: number): number {
  if (point < 1 || point > 24) throw new Error(`invalid point ${point}`);
  return point - 1;
}

function removeChecker(position: Position, player: Player, from: Step["from"]): void {
  if (from === "bar") {
    if (position.bar[player] < 1) {
      throw new Error(`${player} has no checker on the bar`);
    }
    position.bar[player] -= 1;
    return;
  }
  const i = pointIndex(from);
  const v = position.points[i]!;
  if (player === "p1") {
    if (v < 1) throw new Error(`p1 has no checker on point ${from}`);
    position.points[i] = v - 1;
  } else {
    if (v > -1) throw new Error(`p2 has no checker on point ${from}`);
    position.points[i] = v + 1;
  }
}

function placeChecker(position: Position, player: Player, to: Step["to"]): void {
  if (to === "off") {
    position.off[player] += 1;
    return;
  }
  const i = pointIndex(to);
  const v = position.points[i]!;
  const opp = opponent(player);
  if (player === "p1") {
    if (v <= -2) throw new Error(`point ${to} is blocked for p1`);
    if (v === -1) {
      position.points[i] = 0;
      position.bar[opp] += 1;
    }
    position.points[i] += 1;
  } else {
    if (v >= 2) throw new Error(`point ${to} is blocked for p2`);
    if (v === 1) {
      position.points[i] = 0;
      position.bar[opp] += 1;
    }
    position.points[i] -= 1;
  }
}

/** Apply checker steps in order. Hits are implied. Returns a clone. Does not flip onRoll. */
export function applySteps(position: Position, steps: readonly Step[]): Position {
  const next = clonePosition(position);
  const player = next.onRoll;
  for (const step of steps) {
    removeChecker(next, player, step.from);
    placeChecker(next, player, step.to);
  }
  assertFifteen(next);
  return next;
}

/** Apply a play and end the turn: flip onRoll, clear dice. */
export function afterPlay(position: Position, steps: readonly Step[]): Position {
  const next = steps.length > 0 ? applySteps(position, steps) : clonePosition(position);
  next.onRoll = opponent(next.onRoll);
  next.dice = null;
  return next;
}

export type GameResultKind = "single" | "gammon" | "backgammon";

export type GameResult = {
  winner: Player;
  kind: GameResultKind;
  multiplier: 1 | 2 | 3;
};

function loserInWinnerHome(position: Position, winner: Player, loser: Player): boolean {
  if (winner === "p1") {
    for (let i = 0; i < 6; i++) {
      if (position.points[i]! < 0) return true;
    }
  } else {
    for (let i = 18; i < 24; i++) {
      if (position.points[i]! > 0) return true;
    }
  }
  return position.bar[loser] > 0;
}

/** 15 off ends the game. Null if still in play. */
export function gameResult(position: Position): GameResult | null {
  const p1Off = position.off.p1 >= 15;
  const p2Off = position.off.p2 >= 15;
  if (!p1Off && !p2Off) return null;
  const winner: Player = p1Off ? "p1" : "p2";
  const loser = opponent(winner);
  if (position.off[loser] > 0) {
    return { winner, kind: "single", multiplier: 1 };
  }
  if (loserInWinnerHome(position, winner, loser)) {
    return { winner, kind: "backgammon", multiplier: 3 };
  }
  return { winner, kind: "gammon", multiplier: 2 };
}

export function pointsAwarded(cubeValue: number, multiplier: 1 | 2 | 3, length: number, winnerScore: number): number {
  const raw = cubeValue * multiplier;
  const room = Math.max(0, length - winnerScore);
  return Math.min(raw, room);
}

export function applyTake(position: Position, doubler: Player): Position {
  const next = clonePosition(position);
  const taker = opponent(doubler);
  const nextValue = Math.min(next.cube.value * 2, MAX_CUBE_VALUE);
  next.cube.value = nextValue;
  next.cube.owner = taker;
  next.cube.mayDouble =
    nextValue >= MAX_CUBE_VALUE
      ? { p1: false, p2: false }
      : { p1: taker === "p1", p2: taker === "p2" };
  return next;
}

export function nextPhase(
  phase: MatchPhase,
  score: { p1: number; p2: number },
  length: number,
): MatchPhase {
  if (score.p1 >= length || score.p2 >= length) return phase;
  if (phase === "crawford") return "post";
  if (phase === "post") return "post";
  if (score.p1 === length - 1 || score.p2 === length - 1) return "crawford";
  return "pre";
}

export function initialPhase(length: number): MatchPhase {
  return length === 1 ? "crawford" : "pre";
}

export function matchPhase(position: Position): MatchPhase {
  if (position.match.crawford) return "crawford";
  const { length, score } = position.match;
  if (score.p1 === length - 1 || score.p2 === length - 1) return "post";
  return "pre";
}
