import type { CubeDecision, Cubeless, Eval, MatchPhase, Player, Position } from "./types";
import { MAX_CUBE_VALUE, matchPhase } from "./board";
import { matchEquity, stmAwayAfter } from "./met";
import { deadCubeMwc } from "./mwc";

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
  if (!position.match) throw new Error("evaluateCube requires position.match");
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

export function cubefulEquity(cubeless: Cubeless, cubeValue: number): number {
  return cubeless.equity * cubeValue;
}

/**
 * The engine cube decision (ADR 0032): the dead-cube formula above applied to the doubler's own
 * cubeless probabilities for `position` (doubler on roll, before the roll).
 */
export function cubeDecision(position: Position, doublerCubeless: Cubeless): CubeDecision {
  if (
    !position.match ||
    !position.cube.mayDouble[position.onRoll] ||
    position.cube.value >= MAX_CUBE_VALUE
  ) {
    return {
      available: false,
      offer: "no-double",
      take: null,
      noDouble: null,
      doubleTake: null,
      doubleDrop: null,
      cubeless: doublerCubeless,
    };
  }
  const ev = evaluateCube(doublerCubeless, position, matchPhase(position));
  return {
    available: true,
    offer: ev.infallibleOffer,
    take: ev.infallibleTake,
    noDouble: ev.noDouble,
    doubleTake: ev.doubleTake,
    doubleDrop: ev.doubleDrop,
    cubeless: doublerCubeless,
  };
}

/** Engine eval of a result position. `cubeAction` stays null; cube decisions come from `cubeDecision`. */
export function wrapModelEval(cubeless: Cubeless, position: Position): Eval {
  return {
    cubeless,
    cubefulEquity: cubefulEquity(cubeless, position.cube.value),
    cubeAction: null,
    source: "model",
  };
}
