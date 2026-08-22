import {
  afterPlay,
  cubelessFromVector,
  featurize,
  generateLegalPlays,
  stepsKey,
  terminalCubeless,
  type Cubeless,
  type Eval,
  type Position,
  type Step,
} from "ts-core";
import { wrapModelEval } from "ts-core/match";

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
  moves.sort((a, b) => {
    const d = a.eval.cubefulEquity - b.eval.cubefulEquity;
    if (d !== 0) return d;
    return stepsKey(a.steps).localeCompare(stepsKey(b.steps));
  });
  return { moves };
}
