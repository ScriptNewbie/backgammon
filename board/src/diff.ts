import {
  applySteps,
  generateLegalSequences,
  stepsKey,
  type Player,
  type Point,
  type Position,
  type Step,
} from "ts-core";

export type Flight = {
  player: Player;
  from: Point;
  to: Point;
};

export type Motion = {
  roll: boolean;
  cube: boolean;
  flights: Flight[];
};

const PLAYERS: readonly Player[] = ["p1", "p2"];

function sameCheckers(a: Position, b: Position): boolean {
  if (a.bar.p1 !== b.bar.p1 || a.bar.p2 !== b.bar.p2) return false;
  if (a.off.p1 !== b.off.p1 || a.off.p2 !== b.off.p2) return false;
  for (let i = 0; i < 24; i++) if (a.points[i] !== b.points[i]) return false;
  return true;
}

function facesKey(dice: [number, number] | null): string | null {
  if (!dice) return null;
  const [a, b] = dice[0] <= dice[1] ? dice : [dice[1], dice[0]];
  return `${a},${b}`;
}

function countAt(position: Position, player: Player, slot: Point): number {
  if (slot === "bar") return position.bar[player];
  if (slot === "off") return position.off[player];
  const v = position.points[slot - 1] ?? 0;
  return player === "p1" ? Math.max(0, v) : Math.max(0, -v);
}

/** Smaller rank is earlier on the journey from the bar toward off. */
function rank(player: Player, slot: Point): number {
  if (slot === "bar") return 0;
  if (slot === "off") return 100;
  return player === "p1" ? 25 - slot : slot;
}

function allSlots(): Point[] {
  const slots: Point[] = ["bar"];
  for (let p = 1; p <= 24; p++) slots.push(p);
  slots.push("off");
  return slots;
}

function flightsFromSteps(start: Position, steps: readonly Step[]): Flight[] {
  const player = start.onRoll;
  return steps.map((step) => ({ player, from: step.from, to: step.to }));
}

/** Smallest stepsKey among maximal plays whose checker layout is `next`. */
function matchingSteps(prev: Position, next: Position): Step[] | null {
  if (!prev.dice) return null;
  let seqs;
  try {
    seqs = generateLegalSequences(prev);
  } catch {
    return null;
  }
  let best: Step[] | null = null;
  let bestKey: string | null = null;
  for (const seq of seqs) {
    if (seq.steps.length === 0) continue;
    let result: Position;
    try {
      result = applySteps(prev, seq.steps);
    } catch {
      continue;
    }
    if (!sameCheckers(result, next)) continue;
    const key = stepsKey(seq.steps);
    if (bestKey === null || key < bestKey) {
      best = seq.steps;
      bestKey = key;
    }
  }
  return best;
}

function greedy(prev: Position, next: Position): Flight[] {
  const flights: Flight[] = [];
  const slots = allSlots();
  for (const player of PLAYERS) {
    const sources: Point[] = [];
    const dests: Point[] = [];
    for (const slot of slots) {
      const delta = countAt(next, player, slot) - countAt(prev, player, slot);
      for (let i = 0; i < -Math.min(0, delta); i++) sources.push(slot);
      for (let i = 0; i < Math.max(0, delta); i++) dests.push(slot);
    }
    sources.sort((a, b) => rank(player, a) - rank(player, b));
    dests.sort((a, b) => rank(player, a) - rank(player, b));
    const n = Math.min(sources.length, dests.length);
    for (let i = 0; i < n; i++) flights.push({ player, from: sources[i]!, to: dests[i]! });
  }
  return flights.filter((flight) => flight.to !== "bar");
}

/** What to animate when `prev` becomes `next`. `prev` null is the first paint: nothing moves. */
export function diffMotion(prev: Position | null, next: Position): Motion {
  if (!prev) return { roll: false, cube: false, flights: [] };
  let flights: Flight[] = [];
  if (!sameCheckers(prev, next)) {
    const steps = matchingSteps(prev, next);
    if (steps) {
      try {
        flights = flightsFromSteps(prev, steps);
      } catch {
        flights = greedy(prev, next);
      }
    } else {
      flights = greedy(prev, next);
    }
  }
  return {
    roll: next.dice !== null && facesKey(prev.dice) !== facesKey(next.dice),
    cube: prev.cube.value !== next.cube.value || prev.cube.owner !== next.cube.owner,
    flights,
  };
}
