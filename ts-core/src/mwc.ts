import type { Cubeless, EngineMoves, Eval, MatchPhase, Player, Position, Step } from "./types";
import { matchPhase, stepsKey } from "./board";
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

/**
 * Engine checker order (ADR 0032, ADR 0034): best first for the mover at the position's match
 * state, each with the `moverValue` it was ranked by. Match play: mover dead-cube MWC of each
 * result. Money (`match` null): negated `cubefulEquity` (Janowski). Exact ties break by
 * `stepsKey`. `moves[0]` is the engine's play.
 */
export function rankForMover(
  moves: readonly { steps: Step[]; eval: Eval }[],
  positionBeforePlay: Position,
): EngineMoves {
  const phase = positionBeforePlay.match ? matchPhase(positionBeforePlay) : null;
  const scored = moves.map((move) => ({
    move: {
      steps: move.steps,
      eval: move.eval,
      moverValue:
        phase === null ? -move.eval.cubefulEquity : moverMwc(move.eval.cubeless, positionBeforePlay, phase),
    },
    key: stepsKey(move.steps),
  }));
  scored.sort((a, b) => {
    if (a.move.moverValue !== b.move.moverValue) return b.move.moverValue - a.move.moverValue;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  return { moves: scored.map((s) => s.move), moverValueKind: phase === null ? "money" : "mwc" };
}
