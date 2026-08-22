import { randomUUID } from "node:crypto";
import {
  applySteps,
  applyTake,
  clonePosition,
  gameResult,
  initialPhase,
  MAX_CUBE_VALUE,
  nextPhase,
  openingPosition,
  opponent,
  pointsAwarded,
  stepsKey,
  type Cubeless,
  type MatchPhase,
  type Player,
  type Position,
} from "ts-core";
import { evaluateCube, moverMwc } from "ts-core/match";
import { flipStmCubeless, type BgwebClient } from "./bgweb";
import { sampleOffer, sampleTake } from "./cube";
import { DumpWriter } from "./dump";
import { sampleCheckerIndex, sampleLevelPair, sampleMatchLength } from "./levels";
import type { Rng } from "./rng";
import type { DumpRecord, LegalPlay, Level } from "./types";
import { renderMatchSgf, type SgfEvent, type SgfGame } from "./sgf";

function dumpMoves(plays: readonly LegalPlay[]): DumpRecord["moves"] {
  return plays.map((p) => ({ steps: p.steps, eval: p.eval }));
}

function checkerRecord(partial: Omit<DumpRecord, "v" | "id" | "eval" | "xgid" | "decision" | "chosen" | "moves"> & {
  chosen: { steps: LegalPlay["steps"] };
  moves: DumpRecord["moves"];
}): DumpRecord {
  return {
    v: 1,
    id: randomUUID(),
    eval: null,
    xgid: null,
    decision: "checker",
    ...partial,
  };
}

function cubeRecord(partial: Omit<DumpRecord, "v" | "id" | "eval" | "xgid" | "decision" | "moves" | "chosen"> & {
  chosen: { action: "no-double" | "double" | "take" | "drop" };
}): DumpRecord {
  return {
    v: 1,
    id: randomUUID(),
    eval: null,
    xgid: null,
    decision: "cube",
    moves: [],
    ...partial,
  };
}

export async function playMatch(
  client: BgwebClient,
  rng: Rng,
  writer: DumpWriter,
  players: { p1: Level; p2: Level },
  length: number,
): Promise<{ matchId: string; games: number }> {
  const matchId = randomUUID();
  const score = { p1: 0, p2: 0 };
  let phase: MatchPhase = initialPhase(length);
  const sgfGames: SgfGame[] = [];
  let gameIndex = 0;

  while (score.p1 < length && score.p2 < length) {
    const game = await playGame({
      client,
      rng,
      writer,
      players,
      matchId,
      length,
      score: { ...score },
      phase,
      gameIndex,
    });
    const awarded = pointsAwarded(
      game.cubeValue,
      game.result.multiplier,
      length,
      score[game.result.winner],
    );
    score[game.result.winner] += awarded;
    sgfGames.push({
      length,
      gameIndex,
      ws: game.startWs,
      bs: game.startBs,
      p1: players.p1,
      p2: players.p2,
      phase,
      events: game.events,
      result: { winner: game.result.winner, points: awarded },
    });
    phase = nextPhase(phase, score, length);
    gameIndex += 1;
  }

  await writer.commitMatch();
  await writer.writeSgf(matchId, renderMatchSgf(sgfGames));
  return { matchId, games: sgfGames.length };
}

async function playGame(opts: {
  client: BgwebClient;
  rng: Rng;
  writer: DumpWriter;
  players: { p1: Level; p2: Level };
  matchId: string;
  length: number;
  score: { p1: number; p2: number };
  phase: MatchPhase;
  gameIndex: number;
}): Promise<{
  result: { winner: Player; multiplier: 1 | 2 | 3 };
  cubeValue: number;
  startWs: number;
  startBs: number;
  events: SgfEvent[];
}> {
  const { client, rng, writer, players, matchId, length, score, phase } = opts;
  const gameId = randomUUID();
  const startWs = score.p1;
  const startBs = score.p2;
  let pos = openingPosition(length, score, phase);
  const events: SgfEvent[] = [];
  let ply = 0;
  let opening = true;
  let stmCubeless: Cubeless | null = null;

  const openingDice = rollOpening(rng);
  pos.onRoll = openingDice.onRoll;
  pos.dice = openingDice.dice;

  while (true) {
    if (!opening) {
      if (pos.cube.mayDouble[pos.onRoll] && pos.cube.value < MAX_CUBE_VALUE && stmCubeless) {
        const ended = await maybeCube({
          pos,
          stmCubeless,
          phase,
          rng,
          writer,
          players,
          matchId,
          gameId,
          ply,
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
          };
        }
      }
      pos = clonePosition(pos);
      pos.dice = [rng.die(), rng.die()];
    }

    const { plays, plies } = await client.getMoves(pos);
    if (plies !== undefined && writer.plies === undefined) writer.plies = plies;

    const ranked = plays.map((play) => ({
      moverMwc: moverMwc(play.eval.cubeless, pos, phase),
      teacherDiff: play.teacherDiff,
      stepsKey: stepsKey(play.steps),
    }));
    const idx = sampleCheckerIndex(players[pos.onRoll], ranked, rng);
    const chosen = idx < 0 ? { steps: [] as LegalPlay["steps"], eval: null } : plays[idx]!;

    await writer.writeRecord(
      checkerRecord({
        matchId,
        gameId,
        ply,
        players,
        chosen: { steps: chosen.steps },
        position: clonePosition(pos),
        moves: dumpMoves(plays),
      }),
    );
    events.push({
      kind: "move",
      player: pos.onRoll,
      dice: pos.dice ?? [1, 1],
      steps: chosen.steps,
    });

    if (chosen.steps.length > 0) {
      pos = applySteps(pos, chosen.steps);
      stmCubeless = chosen.eval!.cubeless;
    } else if (stmCubeless) {
      stmCubeless = flipStmCubeless(stmCubeless);
    }

    const ended = gameResult(pos);
    if (ended) {
      return {
        result: { winner: ended.winner, multiplier: ended.multiplier },
        cubeValue: pos.cube.value,
        startWs,
        startBs,
        events,
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
  stmCubeless: Cubeless;
  phase: MatchPhase;
  rng: Rng;
  writer: DumpWriter;
  players: { p1: Level; p2: Level };
  matchId: string;
  gameId: string;
  ply: number;
}): Promise<{
  pos: Position;
  events: SgfEvent[];
  drop: { winner: Player; cubeValue: number } | null;
}> {
  const { stmCubeless, phase, rng, writer, players, matchId, gameId, ply } = opts;
  let pos = clonePosition(opts.pos);
  pos.dice = null;
  const doubler = pos.onRoll;
  const cubeEval = evaluateCube(stmCubeless, pos, phase);
  const offer = sampleOffer(players[doubler], cubeEval, rng);
  const events: SgfEvent[] = [];
  const snapshot = clonePosition(pos);

  await writer.writeRecord(
    cubeRecord({
      matchId,
      gameId,
      ply,
      players,
      chosen: { action: offer },
      position: snapshot,
    }),
  );

  if (offer === "no-double") {
    return { pos, events, drop: null };
  }

  events.push({ kind: "cube", player: doubler, action: "double" });
  const taker = opponent(doubler);
  const response = sampleTake(players[taker], cubeEval, rng);
  await writer.writeRecord(
    cubeRecord({
      matchId,
      gameId,
      ply,
      players,
      chosen: { action: response },
      position: clonePosition(pos),
    }),
  );
  events.push({ kind: "cube", player: taker, action: response });

  if (response === "drop") {
    return { pos, events, drop: { winner: doubler, cubeValue: pos.cube.value } };
  }

  pos = applyTake(pos, doubler);
  return { pos, events, drop: null };
}

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

export async function dumpMatches(
  client: BgwebClient,
  rng: Rng,
  writer: DumpWriter,
  matchCount: number,
  lengthOverride?: number,
  shouldStop?: () => boolean,
): Promise<void> {
  for (let i = 0; i < matchCount; i++) {
    if (shouldStop?.()) {
      console.log(`stop after ${i} match(es); committed records=${writer.recordCount}`);
      return;
    }
    const players = sampleLevelPair(rng);
    const length = lengthOverride ?? sampleMatchLength(rng);
    const { matchId, games } = await playMatch(client, rng, writer, players, length);
    console.log(
      `match ${i + 1}/${matchCount} length=${length} games=${games} id=${matchId} records=${writer.recordCount}`,
    );
  }
}
