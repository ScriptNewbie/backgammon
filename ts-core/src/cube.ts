import type { CubeDecision, Cubeless, Eval, MatchPhase, Player, Position } from "./types";
import { MAX_CUBE_VALUE, matchPhase } from "./board";
import { matchEquity, stmAwayAfter } from "./met";
import { deadCubeMwc } from "./mwc";
import { cubeView, moneyCubeful, moneyCubeVerdict } from "./money";

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

/**
 * Cubeful money equity for `player` (whose probs these are) in `position`'s cube state: Janowski
 * with a live cube, `equity × value` when nobody may double (ADR 0034).
 */
export function cubefulEquity(cubeless: Cubeless, position: Position, player: Player): number {
  return moneyCubeful(cubeless, cubeView(position, player), position.cube.value);
}

/**
 * The engine cube decision (ADR 0032, ADR 0034) from the doubler's own cubeless probabilities for
 * `position` (doubler on roll, before the roll): the dead-cube MWC formula above in a match,
 * Janowski money equity for money play.
 */
export function cubeDecision(position: Position, doublerCubeless: Cubeless): CubeDecision {
  const currency = position.match ? "mwc" : "money";
  if (
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
      currency,
    };
  }
  if (!position.match) {
    const view = cubeView(position, position.onRoll) === "mine" ? "mine" : "centered";
    const v = moneyCubeVerdict(doublerCubeless, view, position.cube.value);
    return { available: true, offer: v.offer, take: v.take, noDouble: v.noDouble, doubleTake: v.doubleTake, doubleDrop: v.doubleDrop, cubeless: doublerCubeless, currency };
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
    currency,
  };
}

/** Engine eval of a result position (STM = `position.onRoll`). `cubeAction` stays null; cube decisions come from `cubeDecision`. */
export function wrapModelEval(cubeless: Cubeless, position: Position): Eval {
  return {
    cubeless,
    cubefulEquity: cubefulEquity(cubeless, position, position.onRoll),
    cubeAction: null,
    source: "model",
  };
}
