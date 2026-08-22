import type { CubeEval } from "ts-core/match";
import type { CubeAction, Level } from "./types";
import { logistic, temperature } from "./levels";
import type { Rng } from "./rng";

export type { CubeEval };

export function sampleOffer(level: Level, cubeEval: CubeEval, rng: Rng): "double" | "no-double" {
  if (level === "infallible") return cubeEval.infallibleOffer;
  if (level === "noob") return rng.next() < 0.1 ? "double" : "no-double";
  const tau = temperature(level);
  if (tau === null) return cubeEval.infallibleOffer;
  const delta = cubeEval.tooGood
    ? cubeEval.doubleTake - cubeEval.noDouble
    : (cubeEval.wouldDrop ? cubeEval.doubleDrop : cubeEval.doubleTake) - cubeEval.noDouble;
  return rng.next() < logistic(delta, tau) ? "double" : "no-double";
}

export function sampleTake(level: Level, cubeEval: CubeEval, rng: Rng): "take" | "drop" {
  if (level === "infallible") return cubeEval.infallibleTake;
  if (level === "noob") return rng.next() < 0.5 ? "take" : "drop";
  const tau = temperature(level);
  if (tau === null) return cubeEval.infallibleTake;
  const delta = cubeEval.takerTake - cubeEval.takerDrop;
  return rng.next() < logistic(delta, tau) ? "take" : "drop";
}

export function cubeActionChosen(action: CubeAction): { action: CubeAction } {
  return { action };
}
