import { stepsKey, type Cubeless, type Eval, type MatchPhase, type Position, type Step } from "ts-core";
import { moverMwc } from "ts-core/match";
import { pickBestPlayIndex, type RankedPlay } from "ts-core/sim";

export type ScoredPlay = {
  steps: Step[];
  cubeless: Cubeless;
  teacherDiff: number;
};

export function pickBestPlay(
  plays: readonly { steps: Step[]; eval: Eval; teacherDiff?: number }[],
  position: Position,
  phase: MatchPhase,
): ScoredPlay | null {
  if (plays.length === 0) return null;
  const ranked: RankedPlay[] = plays.map((play) => ({
    moverMwc: moverMwc(play.eval.cubeless, position, phase),
    teacherDiff: play.teacherDiff ?? 0,
    stepsKey: stepsKey(play.steps),
  }));
  const idx = pickBestPlayIndex(ranked);
  const chosen = plays[idx]!;
  return {
    steps: chosen.steps,
    cubeless: chosen.eval.cubeless,
    teacherDiff: chosen.teacherDiff ?? 0,
  };
}
