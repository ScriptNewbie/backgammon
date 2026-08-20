import type { Player, Position, Step } from "./types";

/** Standard opening. Index 0 = point 1. Positive = p1. Same as move-dumper / board-representation.md. */
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
  crawford: boolean,
): Position {
  return {
    points: [...OPENING_POINTS],
    bar: { p1: 0, p2: 0 },
    off: { p1: 0, p2: 0 },
    onRoll: "p1",
    dice: null,
    cube: {
      value: 1,
      owner: "centered",
      mayDouble: crawford ? { p1: false, p2: false } : { p1: true, p2: true },
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

/** Apply checker steps in order. Hits are implied. Returns a clone. */
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

export function applyTake(position: Position, doubler: Player): Position {
  const next = clonePosition(position);
  const taker = opponent(doubler);
  next.cube.value *= 2;
  next.cube.owner = taker;
  next.cube.mayDouble = { p1: taker === "p1", p2: taker === "p2" };
  return next;
}

export function stepsKey(steps: readonly Step[]): string {
  return steps.map((s) => `${s.from}/${s.to}`).join(" ");
}
