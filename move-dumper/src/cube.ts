import type { Cubeless, CubeAction, Level, MatchPhase, Player, Position } from "./types";
import { MAX_CUBE_VALUE } from "./board";
import { matchEquity, stmAwayAfter } from "./met";
import { deadCubeMwc } from "./mwc";
import { logistic, temperature } from "./levels";
import type { Rng } from "./rng";

export type CubeEval = {
  noDouble: number;
  doubleTake: number;
  doubleDrop: number;
  takerTake: number;
  takerDrop: number;
  wouldDrop: boolean;
  tooGood: boolean;
  infallibleOffer: "double" | "no-double";
  infallibleTake: "take" | "drop";
};

export function evaluateCube(
  cubeless: Cubeless,
  position: Position,
  phase: MatchPhase,
): CubeEval {
  const doubler: Player = position.onRoll;
  const C = position.cube.value;
  const noDouble = deadCubeMwc(cubeless, position, C, doubler, phase);
  if (C >= MAX_CUBE_VALUE) {
    return {
      noDouble,
      doubleTake: noDouble,
      doubleDrop: noDouble,
      takerTake: 1 - noDouble,
      takerDrop: 1 - noDouble,
      wouldDrop: false,
      tooGood: false,
      infallibleOffer: "no-double",
      infallibleTake: "take",
    };
  }
  const doubleTake = deadCubeMwc(cubeless, position, 2 * C, doubler, phase);
  const { stmAway, oppAway } = stmAwayAfter(
    position.match.length,
    position.match.score,
    doubler,
    C,
    0,
  );
  const doubleDrop = matchEquity(stmAway, oppAway, phase);
  const takerTake = 1 - doubleTake;
  const takerDrop = 1 - doubleDrop;
  const wouldDrop = takerTake < takerDrop;
  const tooGood = noDouble > doubleTake;
  const offerValue = wouldDrop ? doubleDrop : doubleTake;
  const infallibleOffer: "double" | "no-double" = tooGood
    ? "no-double"
    : offerValue > noDouble
      ? "double"
      : "no-double";
  const infallibleTake: "take" | "drop" = wouldDrop ? "drop" : "take";
  return {
    noDouble,
    doubleTake,
    doubleDrop,
    takerTake,
    takerDrop,
    wouldDrop,
    tooGood,
    infallibleOffer,
    infallibleTake,
  };
}

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
