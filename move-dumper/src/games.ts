import { randomUUID } from "node:crypto";
import { clonePosition, stepsKey, type Cubeless, type Position, type Step } from "ts-core";
import type { LegalPlay } from "ts-core";
import type { GnubgClient } from "ts-core/gnubg";
import { renderMatchSgf } from "ts-core/sgf";
import {
  playGame,
  Rng,
  type MatchPlayer,
  type TurnContext,
} from "ts-core/sim";
import { DumpWriter } from "./dump";
import { consistentPlays } from "./labels";
import { sampleCheckerIndex, sampleLevelPair, type RankedPlay } from "./levels";
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
  /** This game's records, committed together when it ends. */
  readonly records: DumpRecord[] = [];

  constructor(
    readonly client: GnubgClient,
    readonly rng: Rng,
    readonly levels: { p1: Level; p2: Level },
  ) {}

  async chooseChecker(pos: Position, ctx: TurnContext): Promise<{ steps: Step[]; cubeless: Cubeless | null }> {
    const plays = consistentPlays((await this.client.getMoves(pos)).plays);

    const ranked: RankedPlay[] = plays.map((play) => ({
      rankScore: -play.eval.cubeless.equity,
      teacherDiff: play.teacherDiff,
      stepsKey: stepsKey(play.steps),
    }));
    const idx = sampleCheckerIndex(this.levels[pos.onRoll], ranked, this.rng);
    const chosen = idx < 0 ? { steps: [] as Step[], eval: null } : plays[idx]!;

    this.records.push(
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
  client: GnubgClient,
  rng: Rng,
  writer: DumpWriter,
  players: { p1: Level; p2: Level },
): Promise<{ gameId: string }> {
  const teacher = new DumpingTeacher(client, rng, players);
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
  await writer.commitGame(teacher.records);
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

/**
 * Play `gameCount` games, `concurrency` at a time. Game i gets its own RNG, seeded by the i-th
 * draw from `new Rng(seed)`, so a batch's games depend on `seed` alone and not on how many run at
 * once (records land in the order games finish). A stop request or a failed game lets the games
 * in flight finish and starts no new one; the first failure is rethrown.
 */
export async function dumpGames(
  client: GnubgClient,
  seed: number,
  writer: DumpWriter,
  gameCount: number,
  concurrency = 1,
  shouldStop?: () => boolean,
): Promise<void> {
  const seeds = new Rng(seed);
  let started = 0;
  let done = 0;
  let failed = false;
  const worker = async (): Promise<void> => {
    while (started < gameCount && !failed && !shouldStop?.()) {
      started += 1;
      const rng = new Rng(Math.floor(seeds.next() * 2 ** 32));
      const players = sampleLevelPair(rng);
      try {
        const { gameId } = await playDumpedGame(client, rng, writer, players);
        done += 1;
        console.log(`game ${done}/${gameCount} id=${gameId} records=${writer.recordCount}`);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  const workers = Array.from({ length: Math.min(concurrency, gameCount) }, worker);
  const results = await Promise.allSettled(workers);
  const failure = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failure) throw failure.reason;
  if (done < gameCount) console.log(`stop after ${done} game(s); committed records=${writer.recordCount}`);
}
