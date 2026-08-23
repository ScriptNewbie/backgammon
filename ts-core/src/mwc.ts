import type { Cubeless, MatchPhase, Player, Position } from "./types";
import { matchEquity, stmAwayAfter } from "./met";

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function deadCubeMwc(
  cubeless: Cubeless,
  position: Position,
  cubeValue: number,
  stm: Player,
  phase: MatchPhase,
): number {
  if (!position.match) throw new Error("deadCubeMwc requires position.match");
  const { length, score } = position.match;
  const C = cubeValue;
  const pWinSingle = clamp01(cubeless.win - cubeless.gammon);
  const pGammonOnly = clamp01(cubeless.gammon - cubeless.backgammon);
  const pBg = clamp01(cubeless.backgammon);
  const lose = clamp01(1 - cubeless.win);
  const pLoseSingle = clamp01(lose - cubeless.loseGammon);
  const pLoseGammonOnly = clamp01(cubeless.loseGammon - cubeless.loseBackgammon);
  const pLoseBg = clamp01(cubeless.loseBackgammon);

  const metAfter = (stmPts: number, oppPts: number): number => {
    const { stmAway, oppAway } = stmAwayAfter(length, score, stm, stmPts, oppPts);
    return matchEquity(stmAway, oppAway, phase);
  };

  return (
    pWinSingle * metAfter(C, 0) +
    pGammonOnly * metAfter(2 * C, 0) +
    pBg * metAfter(3 * C, 0) +
    pLoseSingle * metAfter(0, C) +
    pLoseGammonOnly * metAfter(0, 2 * C) +
    pLoseBg * metAfter(0, 3 * C)
  );
}

/** Result eval is opponent-to-move; mover MWC is the complement. */
export function moverMwc(
  resultCubeless: Cubeless,
  positionBeforePlay: Position,
  phase: MatchPhase,
): number {
  const opp = positionBeforePlay.onRoll === "p1" ? "p2" : "p1";
  const oppMwc = deadCubeMwc(
    resultCubeless,
    positionBeforePlay,
    positionBeforePlay.cube.value,
    opp,
    phase,
  );
  return 1 - oppMwc;
}
