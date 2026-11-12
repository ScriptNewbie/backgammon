import { randomUUID } from "node:crypto";
import {
  applySteps,
  applyTake,
  clonePosition,
  gameResult,
  initialPhase,
  MAX_CUBE_VALUE,
  nextPhase,
  openingMoneyPosition,
  openingPosition,
  opponent,
  pointsAwarded,
} from "./board";
import { Rng } from "./rng";
import type { SgfEvent, SgfGame } from "./sgf-codec";
import type { Cubeless, MatchPhase, Player, Position, Step } from "./types";

export { Rng } from "./rng";

export type TurnContext = {
  matchId: string;
  gameId: string;
  ply: number;
  phase: MatchPhase;
};

/** The play the side chose. `cubeless` (the engine's eval of the result) is informational: the loop only plays `steps`. */
export type CheckerChoice = {
  steps: Step[];
  cubeless?: Cubeless | null;
};

export type MatchPlayer = {
  chooseChecker(pos: Position, ctx: TurnContext): Promise<CheckerChoice>;
  /** Doubler on roll, `dice` null. The side decides on its own evaluation (ADR 0032). */
  chooseOffer(pos: Position, ctx: TurnContext): Promise<"no-double" | "double">;
  /** Same position as the offer (doubler on roll); the taker answers. */
  chooseTake(pos: Position, ctx: TurnContext): Promise<"take" | "drop">;
};

export type MatchObserver = {
  onChecker?(info: {
    position: Position;
    player: Player;
    dice: [number, number];
    steps: Step[];
    ply: number;
  }): void;
  onCube?(info: {
    position: Position;
    player: Player;
    action: "double" | "take" | "drop";
    ply: number;
  }): void;
};

export function rollOpening(rng: Rng): { onRoll: Player; dice: [number, number] } {
  let d1 = rng.die();
  let d2 = rng.die();
  while (d1 === d2) {
    d1 = rng.die();
    d2 = rng.die();
  }
  if (d1 > d2) return { onRoll: "p1", dice: [d1, d2] };
  return { onRoll: "p2", dice: [d2, d1] };
}

export async function playMatch(opts: {
  rng: Rng;
  length: number;
  players: { p1: MatchPlayer; p2: MatchPlayer };
  labels: { p1: string; p2: string };
  observer?: MatchObserver;
  matchId?: string;
  /** When false, never offer/take/drop; cube stays 1. Default true. */
  allowCube?: boolean;
}): Promise<{
  matchId: string;
  games: SgfGame[];
  score: { p1: number; p2: number };
  winner: Player;
}> {
  const matchId = opts.matchId ?? randomUUID();
  const score = { p1: 0, p2: 0 };
  let phase: MatchPhase = initialPhase(opts.length);
  const sgfGames: SgfGame[] = [];
  let gameIndex = 0;

  while (score.p1 < opts.length && score.p2 < opts.length) {
    const game = await playGame({
      rng: opts.rng,
      players: opts.players,
      observer: opts.observer,
      matchId,
      length: opts.length,
      score: { ...score },
      phase,
      gameIndex,
      allowCube: opts.allowCube,
    });
    const awarded = pointsAwarded(
      game.cubeValue,
      game.result.multiplier,
      opts.length,
      score[game.result.winner],
    );
    score[game.result.winner] += awarded;
    sgfGames.push({
      length: opts.length,
      gameIndex,
      ws: game.startWs,
      bs: game.startBs,
      p1: opts.labels.p1,
      p2: opts.labels.p2,
      phase,
      events: game.events,
      result: { winner: game.result.winner, points: awarded },
    });
    phase = nextPhase(phase, score, opts.length);
    gameIndex += 1;
  }

  const winner: Player = score.p1 >= opts.length ? "p1" : "p2";
  return { matchId, games: sgfGames, score, winner };
}

export async function playGame(opts: {
  rng: Rng;
  players: { p1: MatchPlayer; p2: MatchPlayer };
  matchId: string;
  length: number;
  score: { p1: number; p2: number };
  phase: MatchPhase;
  gameIndex: number;
  observer?: MatchObserver;
  start?: { position: Position; opening: boolean };
  allowCube?: boolean;
  /** Money game: opening `match` is null. SGF still uses `length` / `score` / `phase` as file headers. */
  money?: boolean;
  gameId?: string;
}): Promise<{
  result: { winner: Player; multiplier: 1 | 2 | 3 };
  cubeValue: number;
  startWs: number;
  startBs: number;
  events: SgfEvent[];
  gameId: string;
}> {
  const { rng, players, matchId, length, score, phase, observer } = opts;
  const allowCube = opts.allowCube !== false;
  const gameId = opts.gameId ?? randomUUID();
  const startWs = score.p1;
  const startBs = score.p2;
  let pos =
    opts.start?.position ??
    (opts.money ? openingMoneyPosition() : openingPosition(length, score, phase));
  if (!allowCube) {
    pos = clonePosition(pos);
    pos.cube.mayDouble = { p1: false, p2: false };
  }
  const events: SgfEvent[] = [];
  let ply = 0;
  let opening = opts.start?.opening ?? true;

  if (opening && !pos.dice) {
    const openingDice = rollOpening(rng);
    pos = clonePosition(pos);
    pos.onRoll = openingDice.onRoll;
    pos.dice = openingDice.dice;
  }

  while (true) {
    if (!opening) {
      if (
        allowCube &&
        pos.match &&
        pos.cube.mayDouble[pos.onRoll] &&
        pos.cube.value < MAX_CUBE_VALUE
      ) {
        const ended = await maybeCube({
          pos,
          players,
          observer,
          ctx: { matchId, gameId, ply, phase },
        });
        pos = ended.pos;
        events.push(...ended.events);
        if (ended.drop) {
          return {
            result: { winner: ended.drop.winner, multiplier: 1 },
            cubeValue: ended.drop.cubeValue,
            startWs,
            startBs,
            events,
            gameId,
          };
        }
      }
      pos = clonePosition(pos);
      pos.dice = [rng.die(), rng.die()];
    }

    const mover = players[pos.onRoll];
    const chosen = await mover.chooseChecker(pos, { matchId, gameId, ply, phase });
    const dice = pos.dice ?? [1, 1];
    observer?.onChecker?.({
      position: clonePosition(pos),
      player: pos.onRoll,
      dice,
      steps: chosen.steps,
      ply,
    });
    events.push({
      kind: "move",
      player: pos.onRoll,
      dice,
      steps: chosen.steps,
    });

    if (chosen.steps.length > 0) {
      pos = applySteps(pos, chosen.steps);
    }

    const ended = gameResult(pos);
    if (ended) {
      return {
        result: { winner: ended.winner, multiplier: ended.multiplier },
        cubeValue: pos.cube.value,
        startWs,
        startBs,
        events,
        gameId,
      };
    }

    pos = clonePosition(pos);
    pos.onRoll = opponent(pos.onRoll);
    pos.dice = null;
    ply += 1;
    opening = false;
  }
}

async function maybeCube(opts: {
  pos: Position;
  players: { p1: MatchPlayer; p2: MatchPlayer };
  observer?: MatchObserver;
  ctx: TurnContext;
}): Promise<{
  pos: Position;
  events: SgfEvent[];
  drop: { winner: Player; cubeValue: number } | null;
}> {
  const { players, observer, ctx } = opts;
  let pos = clonePosition(opts.pos);
  pos.dice = null;
  const doubler = pos.onRoll;
  const offer = await players[doubler].chooseOffer(pos, ctx);
  const events: SgfEvent[] = [];

  if (offer === "no-double") {
    return { pos, events, drop: null };
  }

  observer?.onCube?.({ position: clonePosition(pos), player: doubler, action: "double", ply: ctx.ply });
  events.push({ kind: "cube", player: doubler, action: "double" });
  const taker = opponent(doubler);
  const response = await players[taker].chooseTake(pos, ctx);
  observer?.onCube?.({ position: clonePosition(pos), player: taker, action: response, ply: ctx.ply });
  events.push({ kind: "cube", player: taker, action: response });

  if (response === "drop") {
    return { pos, events, drop: { winner: doubler, cubeValue: pos.cube.value } };
  }

  pos = applyTake(pos, doubler);
  return { pos, events, drop: null };
}
