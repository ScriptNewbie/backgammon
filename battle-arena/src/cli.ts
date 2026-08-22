import path from "node:path";
import { fileURLToPath } from "node:url";
import { BgwebClient } from "ts-core/bgweb";
import { renderMatchSgf } from "ts-core/sgf";
import { playMatch, Rng, type MatchPlayer } from "ts-core/sim";
import { createGameEngineDriver, engineHealthCheck } from "./drivers/game-engine";
import { createTeacherDriver } from "./drivers/teacher";
import { batchStamp, writeMatchSgf } from "./replay";
import {
  engineAtSeat,
  formatSummary,
  summarize,
  type MatchSummaryRow,
} from "./summary";

export const MATCH_LENGTHS = [1, 3, 5, 7, 9, 11, 13, 15] as const;

export type CliArgs = {
  matches: number;
  seed: number;
  length: number;
  teacherUrl: string;
  engineUrl: string;
  allowCube: boolean;
};

export function parseArgs(argv: string[]): CliArgs {
  let matches = 1;
  let seed = 1;
  let length = 7;
  let teacherUrl = process.env.BGWEB_BASE_URL ?? "http://127.0.0.1:8080";
  let engineUrl = process.env.ENGINE_BASE_URL ?? "http://127.0.0.1:3000";
  let allowCube = true;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--matches") matches = Number(argv[++i]);
    else if (arg === "--seed") seed = Number(argv[++i]);
    else if (arg === "--length") length = Number(argv[++i]);
    else if (arg === "--teacher-url") teacherUrl = argv[++i]!;
    else if (arg === "--engine-url") engineUrl = argv[++i]!;
    else if (arg === "--no-cube") allowCube = false;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  if (!Number.isInteger(matches) || matches < 1) {
    throw new Error(`--matches must be a positive integer (got ${matches})`);
  }
  if (!Number.isInteger(seed)) {
    throw new Error(`--seed must be an integer (got ${seed})`);
  }
  if (!(MATCH_LENGTHS as readonly number[]).includes(length)) {
    throw new Error(`--length must be one of ${MATCH_LENGTHS.join(",")} (got ${length})`);
  }
  return { matches, seed, length, teacherUrl, engineUrl, allowCube };
}

function printHelp(): void {
  console.log(`Usage: npm run battle -- [--matches N] [--seed N] [--length N] [--no-cube] [--teacher-url URL] [--engine-url URL]

Play our game-engine against the bgweb-api teacher at max strength.

  --matches       Number of matches (default 1)
  --seed          RNG seed (default 1)
  --length        Match length 1,3,5,7,9,11,13,15 (default 7)
  --no-cube       Checker-only: never offer, take, or drop
  --teacher-url   bgweb-api origin (default http://127.0.0.1:8080, or BGWEB_BASE_URL)
  --engine-url    game-engine origin (default http://127.0.0.1:3000, or ENGINE_BASE_URL)

From battle-arena/ (npm wraps Docker Compose):
  npm run up
  npm test
  npm run battle -- --matches 1 --seed 1 --length 7
  npm run battle -- --matches 1 --seed 1 --no-cube
  npm run down
  npm run install:host

Requires training-ground/checkpoints/cubeless.onnx. Writes GNU SGF under replays/.
`);
}

export function seatsForMatch(index: number): { engineSeat: "p1" | "p2"; labels: { p1: string; p2: string } } {
  if (index % 2 === 0) {
    return { engineSeat: "p1", labels: { p1: "game-engine", p2: "teacher" } };
  }
  return { engineSeat: "p2", labels: { p1: "teacher", p2: "game-engine" } };
}

export function playersForSeats(
  engineSeat: "p1" | "p2",
  engine: MatchPlayer,
  teacher: MatchPlayer,
): { p1: MatchPlayer; p2: MatchPlayer } {
  if (engineSeat === "p1") return { p1: engine, p2: teacher };
  return { p1: teacher, p2: engine };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const teacherClient = new BgwebClient(args.teacherUrl);
  try {
    await teacherClient.healthCheck();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exitCode = 1;
    return;
  }
  try {
    await engineHealthCheck(args.engineUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exitCode = 1;
    return;
  }

  const packageRoot = fileURLToPath(new URL("..", import.meta.url));
  const replaysRoot = path.join(packageRoot, "replays");
  const { batchId } = batchStamp();
  const teacher = createTeacherDriver(teacherClient);
  const engine = createGameEngineDriver(args.engineUrl);
  const rng = new Rng(args.seed);
  const rows: MatchSummaryRow[] = [];
  let stop = false;
  const requestStop = (): void => {
    if (stop) return;
    stop = true;
    console.error("stop requested; finishing after the current match");
  };
  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);

  try {
    for (let i = 0; i < args.matches; i++) {
      if (stop) {
        console.log(`stop after ${i} match(es)`);
        break;
      }
      const { engineSeat, labels } = seatsForMatch(i);
      const result = await playMatch({
        rng,
        length: args.length,
        players: playersForSeats(engineSeat, engine, teacher),
        labels,
        allowCube: args.allowCube,
      });
      const sgf = renderMatchSgf(result.games, { app: "battle-arena:1" });
      const file = await writeMatchSgf({
        replaysRoot,
        batchId,
        matchId: result.matchId,
        sgf,
      });
      const winner = engineAtSeat(engineSeat, result.winner);
      const points = {
        "game-engine": engineSeat === "p1" ? result.score.p1 : result.score.p2,
        teacher: engineSeat === "p1" ? result.score.p2 : result.score.p1,
      };
      rows.push({
        winner,
        engineSeat,
        games: result.games.length,
        points,
      });
      console.log(
        `match ${i + 1}/${args.matches} ${labels.p1} vs ${labels.p2} winner=${winner} games=${result.games.length} ${file}`,
      );
    }
  } finally {
    process.off("SIGINT", requestStop);
    process.off("SIGTERM", requestStop);
  }

  console.log(
    formatSummary(summarize(rows, { length: args.length, seed: args.seed, allowCube: args.allowCube })),
  );
}

const thisFile = fileURLToPath(import.meta.url);
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked && path.normalize(invoked) === path.normalize(thisFile)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
