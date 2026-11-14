import type { CubeDecision, Cubeless, Eval, Player, Position } from "./types";
import { MAX_CUBE_VALUE } from "./board";
import { matchCubeVerdict } from "./match-cube";
import { cubeView, moneyCubeful, moneyCubeVerdict } from "./money";

/**
 * Cubeful money equity for `player` (whose probs these are) in `position`'s cube state: Janowski
 * with a live cube, `equity × value` when nobody may double (ADR 0034).
 */
export function cubefulEquity(cubeless: Cubeless, position: Position, player: Player): number {
  return moneyCubeful(cubeless, cubeView(position, player), position.cube.value);
}

/**
 * The engine cube decision (ADR 0032, ADR 0034) from the doubler's own cubeless probabilities for
 * `position` (doubler on roll, before the roll): the live-cube match model (ADR 0035) in a match,
 * Janowski money equity for money play (ADR 0034).
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
  const view = cubeView(position, position.onRoll) === "mine" ? "mine" : "centered";
  const v = position.match
    ? matchCubeVerdict(doublerCubeless, position, view)
    : moneyCubeVerdict(doublerCubeless, view, position.cube.value);
  return {
    available: true,
    offer: v.offer,
    take: v.take,
    noDouble: v.noDouble,
    doubleTake: v.doubleTake,
    doubleDrop: v.doubleDrop,
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
