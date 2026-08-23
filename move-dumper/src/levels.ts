import type { Level } from "./types";
import { pickBestPlayIndex, type RankedPlay, type Rng } from "ts-core/sim";

export const LEVELS: readonly Level[] = [
  "noob",
  "beginner",
  "midwit",
  "genius",
  "infallible",
];

export const TEMPERATURES: Record<"beginner" | "midwit" | "genius", number> = {
  beginner: 0.08,
  midwit: 0.025,
  genius: 0.008,
};

/** Unordered pair keys, names sorted alphabetically. */
export const PAIRING_WEIGHTS: Record<string, number> = {
  "beginner-beginner": 2,
  "beginner-genius": 2,
  "beginner-infallible": 1,
  "beginner-midwit": 3,
  "beginner-noob": 1,
  "genius-genius": 4,
  "genius-infallible": 6,
  "genius-midwit": 7,
  "genius-noob": 0.5,
  "infallible-infallible": 2,
  "infallible-midwit": 3,
  "infallible-noob": 0.5,
  "midwit-midwit": 8,
  "midwit-noob": 1,
  "noob-noob": 0,
};

function pairKey(a: Level, b: Level): string {
  return [a, b].sort().join("-");
}

export function sampleLevelPair(rng: Rng): { p1: Level; p2: Level } {
  const entries = Object.entries(PAIRING_WEIGHTS).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng.next() * total;
  let key = entries[0]![0];
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) {
      key = k;
      break;
    }
  }
  const [a, b] = key.split("-") as [Level, Level];
  if (a === b || rng.next() < 0.5) return { p1: a, p2: b };
  return { p1: b, p2: a };
}

export function temperature(level: Level): number | null {
  if (level === "beginner" || level === "midwit" || level === "genius") {
    return TEMPERATURES[level];
  }
  return null;
}

export function pairKeyFor(a: Level, b: Level): string {
  return pairKey(a, b);
}

export function softmaxSample(weights: readonly number[], rng: Rng): number {
  const max = Math.max(...weights);
  const exps = weights.map((w) => Math.exp(w - max));
  const sum = exps.reduce((s, x) => s + x, 0);
  let r = rng.next() * sum;
  for (let i = 0; i < exps.length; i++) {
    r -= exps[i]!;
    if (r <= 0) return i;
  }
  return exps.length - 1;
}

export type { RankedPlay };

export function sampleCheckerIndex(level: Level, plays: readonly RankedPlay[], rng: Rng): number {
  if (plays.length === 0) return -1;
  if (level === "noob") return rng.int(plays.length);
  if (level === "infallible") return pickBestPlayIndex(plays);
  const tau = temperature(level);
  if (tau === null) return sampleCheckerIndex("infallible", plays, rng);
  const max = Math.max(...plays.map((p) => p.rankScore));
  return softmaxSample(
    plays.map((p) => (p.rankScore - max) / tau),
    rng,
  );
}

export function logistic(delta: number, tau: number): number {
  const x = delta / tau;
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  const e = Math.exp(x);
  return e / (1 + e);
}
