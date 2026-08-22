import { randomUUID } from "node:crypto";
import { clonePosition, opponent, stepsKey, type Cubeless, type Position, type Step } from "ts-core";
import { BgwebClient, type LegalPlay } from "ts-core/bgweb";
import { moverMwc } from "ts-core/match";
import { renderMatchSgf } from "ts-core/sgf";
import {
  playMatch as simPlayMatch,
  Rng,
  type MatchPlayer,
  type RankedPlay,
  type TurnContext,
} from "ts-core/sim";
import { sampleOffer, sampleTake } from "./cube";
import { DumpWriter } from "./dump";
import { sampleCheckerIndex, sampleLevelPair, sampleMatchLength } from "./levels";
import type { DumpRecord, Level } from "./types";

function dumpMoves(plays: readonly LegalPlay[]): DumpRecord["moves"] {
  return plays.map((p) => ({ steps: p.steps, eval: p.eval }));
}

function checkerRecord(partial: Omit<DumpRecord, "v" | "id" | "eval" | "xgid" | "decision" | "chosen" | "moves"> & {
  chosen: { steps: Step[] };
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

class DumpingTeacher implements MatchPlayer {
  constructor(
    readonly client: BgwebClient,
    readonly rng: Rng,
    readonly writer: DumpWriter,
    readonly levels: { p1: Level; p2: Level },
  ) {}

  async chooseChecker(pos: Position, ctx: TurnContext): Promise<{ steps: Step[]; cubeless: Cubeless | null }> {
    const { plays, plies } = await this.client.getMoves(pos);
    if (plies !== undefined && this.writer.plies === undefined) this.writer.plies = plies;

    const ranked: RankedPlay[] = plays.map((play) => ({
      moverMwc: moverMwc(play.eval.cubeless, pos, ctx.phase),
      teacherDiff: play.teacherDiff,
      stepsKey: stepsKey(play.steps),
    }));
    const idx = sampleCheckerIndex(this.levels[pos.onRoll], ranked, this.rng);
    const chosen = idx < 0 ? { steps: [] as Step[], eval: null } : plays[idx]!;

    await this.writer.writeRecord(
      checkerRecord({
        matchId: ctx.matchId,
        gameId: ctx.gameId,
        ply: ctx.ply,
        players: this.levels,
        chosen: { steps: chosen.steps },
        position: clonePosition(pos),
        moves: dumpMoves(plays),
      }),
    );

    return {
      steps: chosen.steps,
      cubeless: chosen.eval?.cubeless ?? null,
    };
  }

  async chooseOffer(pos: Position, cubeEval: Parameters<MatchPlayer["chooseOffer"]>[1], ctx: TurnContext) {
    const offer = sampleOffer(this.levels[pos.onRoll], cubeEval, this.rng);
    await this.writer.writeRecord(
      cubeRecord({
        matchId: ctx.matchId,
        gameId: ctx.gameId,
        ply: ctx.ply,
        players: this.levels,
        chosen: { action: offer },
        position: clonePosition(pos),
      }),
    );
    return offer;
  }

  async chooseTake(pos: Position, cubeEval: Parameters<MatchPlayer["chooseTake"]>[1], ctx: TurnContext) {
    const response = sampleTake(this.levels[opponent(pos.onRoll)], cubeEval, this.rng);
    await this.writer.writeRecord(
      cubeRecord({
        matchId: ctx.matchId,
        gameId: ctx.gameId,
        ply: ctx.ply,
        players: this.levels,
        chosen: { action: response },
        position: clonePosition(pos),
      }),
    );
    return response;
  }
}

export async function playMatch(
  client: BgwebClient,
  rng: Rng,
  writer: DumpWriter,
  players: { p1: Level; p2: Level },
  length: number,
): Promise<{ matchId: string; games: number }> {
  const teacher = new DumpingTeacher(client, rng, writer, players);
  const result = await simPlayMatch({
    rng,
    length,
    players: { p1: teacher, p2: teacher },
    labels: { p1: players.p1, p2: players.p2 },
  });
  await writer.commitMatch();
  await writer.writeSgf(result.matchId, renderMatchSgf(result.games, { app: "move-dumper:1" }));
  return { matchId: result.matchId, games: result.games.length };
}

export { rollOpening } from "ts-core/sim";

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
