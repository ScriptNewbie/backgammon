import {
  afterPlay,
  cubelessFromVector,
  featurize,
  generateLegalPlays,
  terminalCubeless,
  type CubeDecision,
  type Cubeless,
  type Eval,
  type Position,
  type Step,
} from "ts-core";
import { cubeDecision, sortForMover, wrapModelEval } from "ts-core/match";

export type Infer = {
  infer(features: Float32Array[]): Promise<Float32Array[]>;
};

export type ScoredMove = {
  steps: Step[];
  eval: Eval;
};

export async function evaluatePosition(
  position: Position,
  infer: Infer,
): Promise<{ moves: ScoredMove[] }> {
  const plays = generateLegalPlays(position);
  if (plays.length === 0) return { moves: [] };

  const results = plays.map((steps) => ({ steps, result: afterPlay(position, steps) }));
  const cubeless: (Cubeless | null)[] = results.map((row) => terminalCubeless(row.result));
  const needNet: number[] = [];
  for (let i = 0; i < cubeless.length; i++) {
    if (cubeless[i] === null) needNet.push(i);
  }
  if (needNet.length > 0) {
    const features = needNet.map((i) => featurize(results[i]!.result));
    const outs = await infer.infer(features);
    if (outs.length !== needNet.length) {
      throw new Error(`infer returned ${outs.length} rows, expected ${needNet.length}`);
    }
    for (let j = 0; j < needNet.length; j++) {
      cubeless[needNet[j]!] = cubelessFromVector(outs[j]!);
    }
  }

  const moves: ScoredMove[] = results.map((row, i) => ({
    steps: row.steps,
    eval: wrapModelEval(cubeless[i]!, row.result),
  }));
  // Best first for the mover at the position's match state (ADR 0032): moves[0] is our play.
  return { moves: sortForMover(moves, position) };
}

/**
 * `POST /cube` (ADR 0032): the net's cubeless probs for the doubler on roll (before the roll),
 * through the dead-cube formula. A finished position cannot be on roll, so the net always runs.
 */
export async function cubePosition(position: Position, infer: Infer): Promise<CubeDecision> {
  const [out] = await infer.infer([featurize(position)]);
  if (!out) throw new Error("infer returned no row");
  return cubeDecision(position, cubelessFromVector(out));
}
