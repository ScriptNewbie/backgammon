import { randomUUID } from "node:crypto";
import { clonePosition, stepsKey, type Cubeless, type Position, type Step } from "ts-core";
import { BgwebClient, type LegalPlay } from "ts-core/bgweb";
import { renderMatchSgf } from "ts-core/sgf";
import {
  playGame,
  Rng,
  type MatchPlayer,
  type RankedPlay,
  type TurnContext,
} from "ts-core/sim";
import { DumpWriter } from "./dump";
import { sampleCheckerIndex, sampleLevelPair } from "./levels";
import type { DumpRecord, Level } from "./types";

function dumpMoves(plays: readonly LegalPlay[]): DumpRecord["moves"] {
  return plays.map((p) => ({ steps: p.steps, eval: p.eval }));
}

function checkerRecord(
  partial: Omit<DumpRecord, "v" | "id" | "eval" | "xgid" | "decision" | "chosen" | "moves"> & {
    chosen: { steps: Step[] };
    moves: DumpRecord["moves"];
  },
): DumpRecord {
  return {
    v: 1,
    id: randomUUID(),
    eval: null,
    xgid: null,
    decision: "checker",
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
      rankScore: -play.eval.cubeless.equity,
      teacherDiff: play.teacherDiff,
      stepsKey: stepsKey(play.steps),
    }));
    const idx = sampleCheckerIndex(this.levels[pos.onRoll], ranked, this.rng);
    const chosen = idx < 0 ? { steps: [] as Step[], eval: null } : plays[idx]!;

    await this.writer.writeRecord(
      checkerRecord({
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

  async chooseOffer(): Promise<"no-double" | "double"> {
    throw new Error("dumper games have no cube");
  }

  async chooseTake(): Promise<"take" | "drop"> {
    throw new Error("dumper games have no cube");
  }
}

export async function playDumpedGame(
  client: BgwebClient,
  rng: Rng,
  writer: DumpWriter,
  players: { p1: Level; p2: Level },
): Promise<{ gameId: string }> {
  const teacher = new DumpingTeacher(client, rng, writer, players);
  const gameId = randomUUID();
  // GNU SGF still uses a 1-point MI header; Position.match is null.
  const result = await playGame({
    rng,
    players: { p1: teacher, p2: teacher },
    matchId: gameId,
    gameId,
    length: 1,
    score: { p1: 0, p2: 0 },
    phase: "crawford",
    gameIndex: 0,
    allowCube: false,
    money: true,
  });
  await writer.commitGame();
  await writer.writeSgf(
    gameId,
    renderMatchSgf(
      [
        {
          length: 1,
          gameIndex: 0,
          ws: 0,
          bs: 0,
          p1: players.p1,
          p2: players.p2,
          phase: "crawford",
          events: result.events,
          result: { winner: result.result.winner, points: result.result.multiplier },
        },
      ],
      { app: "move-dumper:1" },
    ),
  );
  return { gameId };
}

export { rollOpening } from "ts-core/sim";

export async function dumpGames(
  client: BgwebClient,
  rng: Rng,
  writer: DumpWriter,
  gameCount: number,
  shouldStop?: () => boolean,
): Promise<void> {
  for (let i = 0; i < gameCount; i++) {
    if (shouldStop?.()) {
      console.log(`stop after ${i} game(s); committed records=${writer.recordCount}`);
      return;
    }
    const players = sampleLevelPair(rng);
    const { gameId } = await playDumpedGame(client, rng, writer, players);
    console.log(`game ${i + 1}/${gameCount} id=${gameId} records=${writer.recordCount}`);
  }
}
