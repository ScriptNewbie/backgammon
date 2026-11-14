import { applySteps, stepsKey, type EngineMove, type EngineMoves, type LegalSequence, type Position, type Step } from "ts-core";

/** One checker step the human has made this turn, with the die it used. */
export type PlayedStep = { step: Step; die: number };

export type { EngineMove, EngineMoves };

function sameStep(a: Step | undefined, b: Step): boolean {
  return a !== undefined && a.from === b.from && a.to === b.to;
}

function matchesPrefix(seq: LegalSequence, played: readonly PlayedStep[]): boolean {
  return played.every((p, i) => sameStep(seq.steps[i], p.step) && seq.dice[i] === p.die);
}

/** Next steps (with dice) that keep the turn legal. */
export function nextOptions(seqs: readonly LegalSequence[], played: readonly PlayedStep[]): PlayedStep[] {
  const out: PlayedStep[] = [];
  const seen = new Set<string>();
  for (const seq of seqs) {
    if (!matchesPrefix(seq, played)) continue;
    const step = seq.steps[played.length];
    const die = seq.dice[played.length];
    if (!step || die === undefined) continue;
    const key = `${step.from}/${step.to}#${die}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ step, die });
  }
  return out;
}

/** Points (or the bar) the human can move from right now. */
export function movableFrom(seqs: readonly LegalSequence[], played: readonly PlayedStep[]): Set<number | "bar"> {
  return new Set(nextOptions(seqs, played).map((o) => o.step.from));
}

/** Dice still unused, in display order (a double counts once per remaining use). */
export function remainingDice(dice: readonly [number, number], played: readonly PlayedStep[]): number[] {
  const pool = dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [...dice];
  for (const p of played) {
    const i = pool.indexOf(p.die);
    if (i >= 0) pool.splice(i, 1);
  }
  return pool;
}

/**
 * Clicking a checker on `from` moves it with the first die (in display order)
 * that gives a legal step. Null if no die works from there.
 */
export function chooseStep(
  seqs: readonly LegalSequence[],
  played: readonly PlayedStep[],
  from: number | "bar",
  dice: readonly [number, number],
): PlayedStep | null {
  const options = nextOptions(seqs, played).filter((o) => o.step.from === from);
  for (const die of remainingDice(dice, played)) {
    const hit = options.find((o) => o.die === die);
    if (hit) return hit;
  }
  return null;
}

export function turnComplete(seqs: readonly LegalSequence[], played: readonly PlayedStep[]): boolean {
  if (seqs.length === 0) return true;
  return played.length >= seqs[0]!.steps.length;
}

function boardKey(position: Position): string {
  return `${position.points.join(",")}|${position.bar.p1},${position.bar.p2}|${position.off.p1},${position.off.p2}`;
}

/** The engine's entry for a play: same resulting board (the engine lists one step order per board). */
export function findMove(moves: readonly EngineMove[], start: Position, steps: readonly Step[]): EngineMove | null {
  const target = boardKey(applySteps(start, steps));
  return moves.find((m) => boardKey(applySteps(start, m.steps)) === target) ?? null;
}

/**
 * Your play against the engine's choice, on the engine's own scale (ADR 0034): `moverValue` is
 * match winning chance in a match and cubeful money equity (points) in money play. `loss` is
 * how much less your play is worth by that measure (0 when you matched the engine).
 */
export type MoveReview = {
  kind: EngineMoves["moverValueKind"];
  yours: string;
  yourValue: number;
  best: string;
  bestValue: number;
  loss: number;
};

export function reviewMove(engine: EngineMoves, start: Position, steps: readonly Step[]): MoveReview | null {
  const { moves } = engine;
  const best = moves[0];
  const mine = findMove(moves, start, steps);
  if (!best || !mine) return null;
  return {
    kind: engine.moverValueKind,
    yours: stepsKey(steps),
    yourValue: mine.moverValue,
    best: stepsKey(best.steps),
    bestValue: best.moverValue,
    loss: Math.max(0, best.moverValue - mine.moverValue),
  };
}
