import path from "node:path";
import { fileURLToPath } from "node:url";
import { BgwebClient } from "ts-core/bgweb";
import { HedgehogClient } from "ts-core/hedgehog";
import { renderMatchSgf } from "ts-core/sgf";
import { playMatch, Rng, type MatchPlayer } from "ts-core/sim";
import { createCheckerDriver } from "./drivers/checker";
import { createGameEngineDriver, engineHealthCheck } from "./drivers/game-engine";
import { batchStamp, writeMatchSgf } from "./replay";
import {
  isDriverName,
  resolveSide,
  type DriverName,
  type RequestedParams,
  type SideId,
  type SideSpec,
} from "./sides";
import { formatSummary, summarize, winnerSide, type MatchSummaryRow } from "./summary";

export const MATCH_LENGTHS = [1, 3, 5, 7, 9, 11, 13, 15] as const;

const REMOVED: Record<string, string> = {
  "--opponent": "use --a and --b (for example --b hedgehog)",
  "--ply": "use --a-ply and --b-ply",
  "--engine-url": "use --a-url or --b-url",
  "--teacher-url": "use --a-url or --b-url",
  "--hedgehog-url": "use --a-url or --b-url",
};

export type CliArgs = {
  matches: number;
  seed: number;
  length: number;
  allowCube: boolean;
  a: SideSpec;
  b: SideSpec;
  warnings: string[];
};

function take(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function takePly(argv: string[], index: number, flag: string): 1 | 2 {
  const raw = take(argv, index, flag);
  const n = Number(raw);
  if (n !== 1 && n !== 2) throw new Error(`${flag} must be 1 or 2 (got ${raw})`);
  return n;
}

export function parseArgs(argv: string[]): CliArgs {
  let matches = 1;
  let seed = 1;
  let length = 7;
  let allowCube = true;
  const requested: Record<SideId, { driver: DriverName } & RequestedParams> = {
    a: { driver: "game-engine" },
    b: { driver: "teacher" },
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const removed = REMOVED[arg];
    if (removed) throw new Error(`${arg} was removed; ${removed}`);
    if (arg === "--matches") matches = Number(take(argv, ++i, arg));
    else if (arg === "--seed") seed = Number(take(argv, ++i, arg));
    else if (arg === "--length") length = Number(take(argv, ++i, arg));
    else if (arg === "--no-cube") allowCube = false;
    else if (arg === "--a" || arg === "--b") {
      const side: SideId = arg === "--a" ? "a" : "b";
      const name = take(argv, ++i, arg);
      if (!isDriverName(name)) {
        throw new Error(`${arg} must be ${["game-engine", "teacher", "hedgehog"].join(", ")} (got ${name})`);
      }
      requested[side].driver = name;
    } else if (arg === "--a-url" || arg === "--b-url") {
      const side: SideId = arg === "--a-url" ? "a" : "b";
      requested[side].url = take(argv, ++i, arg);
    } else if (arg === "--a-ply" || arg === "--b-ply") {
      const side: SideId = arg === "--a-ply" ? "a" : "b";
      requested[side].ply = takePly(argv, ++i, arg);
    } else if (arg === "--help" || arg === "-h") {
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
  const a = resolveSide("a", requested.a.driver, requested.a);
  const b = resolveSide("b", requested.b.driver, requested.b);
  return {
    matches,
    seed,
    length,
    allowCube,
    a: a.side,
    b: b.side,
    warnings: [...a.warnings, ...b.warnings],
  };
}

function printHelp(): void {
  console.log(`Usage: docker compose --profile arena run --rm arena npm run battle:inner -- [--matches N] [--seed N] [--length N] [--no-cube] [--a DRIVER] [--b DRIVER] [--a-url URL] [--b-url URL] [--a-ply 1|2] [--b-ply 1|2]

Play any driver against any driver at max strength. Default is game-engine vs teacher.
The same driver may sit on both sides. Side a is p1 on even matches and p2 on odd matches.

  --matches       Number of matches (default 1)
  --seed          RNG seed (default 1)
  --length        Match length 1,3,5,7,9,11,13,15 (default 7)
  --no-cube       Checker-only: never offer, take, or drop
  --a             Side a: game-engine, teacher, or hedgehog (default game-engine)
  --b             Side b (default teacher)
  --a-url         Origin for side a (default depends on that driver)
  --b-url         Origin for side b
  --a-ply         Search depth 1 or 2. Hedgehog only (default 2). Other drivers ignore it and warn.
  --b-ply         Same for side b

URL defaults: game-engine ENGINE_BASE_URL or http://127.0.0.1:3000; teacher BGWEB_BASE_URL or http://127.0.0.1:8080; hedgehog HEDGEHOG_BASE_URL or http://127.0.0.1:8090.

From battle-arena/ (see README.md):
  docker compose up -d
  docker compose --profile test run --rm test
  docker compose --profile arena run --rm arena npm run battle:inner -- --matches 1 --seed 1 --length 7
  docker compose --profile arena run --rm arena npm run battle:inner -- --a game-engine --b hedgehog --b-ply 1 --matches 1 --seed 1
  docker compose down

A game-engine side needs training-ground/checkpoints/cubeless.onnx. Writes GNU SGF under replays/.
`);
}

export function seatsForMatch(
  index: number,
  aLabel: string,
  bLabel: string,
): { aSeat: "p1" | "p2"; labels: { p1: string; p2: string } } {
  if (index % 2 === 0) return { aSeat: "p1", labels: { p1: aLabel, p2: bLabel } };
  return { aSeat: "p2", labels: { p1: bLabel, p2: aLabel } };
}

export function playersForSeats(
  aSeat: "p1" | "p2",
  a: MatchPlayer,
  b: MatchPlayer,
): { p1: MatchPlayer; p2: MatchPlayer } {
  if (aSeat === "p1") return { p1: a, p2: b };
  return { p1: b, p2: a };
}

function createPlayer(side: SideSpec): MatchPlayer {
  if (side.driver === "game-engine") return createGameEngineDriver(side.url);
  if (side.driver === "teacher") return createCheckerDriver(new BgwebClient(side.url));
  return createCheckerDriver(new HedgehogClient(side.url, side.ply ?? 2));
}

async function healthCheckSide(side: SideSpec): Promise<void> {
  if (side.driver === "game-engine") {
    await engineHealthCheck(side.url);
    return;
  }
  if (side.driver === "teacher") {
    await new BgwebClient(side.url).healthCheck();
    return;
  }
  await new HedgehogClient(side.url, side.ply ?? 2).healthCheck();
}

async function checkHealth(sides: readonly SideSpec[]): Promise<boolean> {
  const seen = new Set<string>();
  for (const side of sides) {
    const key = `${side.driver}\n${side.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      await healthCheckSide(side);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(message);
      if (side.driver === "hedgehog") {
        console.error("Start the Hedgehog sidecar first. See docs/domain/hedgehog.md.");
      }
      return false;
    }
  }
  return true;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  for (const warning of args.warnings) console.warn(warning);
  if (!(await checkHealth([args.a, args.b]))) {
    process.exitCode = 1;
    return;
  }

  const packageRoot = fileURLToPath(new URL("..", import.meta.url));
  const replaysRoot = path.join(packageRoot, "replays");
  const { batchId } = batchStamp(new Date(), args.a.label, args.b.label);
  const playerA = createPlayer(args.a);
  const playerB = createPlayer(args.b);
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
      const { aSeat, labels } = seatsForMatch(i, args.a.label, args.b.label);
      const result = await playMatch({
        rng,
        length: args.length,
        players: playersForSeats(aSeat, playerA, playerB),
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
      const winner = winnerSide(aSeat, result.winner);
      const points = {
        a: aSeat === "p1" ? result.score.p1 : result.score.p2,
        b: aSeat === "p1" ? result.score.p2 : result.score.p1,
      };
      rows.push({
        winner,
        aSeat,
        games: result.games.length,
        points,
      });
      const winnerLabel = winner === "a" ? args.a.label : args.b.label;
      console.log(
        `match ${i + 1}/${args.matches} ${labels.p1} vs ${labels.p2} winner=${winnerLabel} games=${result.games.length} ${file}`,
      );
    }
  } finally {
    process.off("SIGINT", requestStop);
    process.off("SIGTERM", requestStop);
  }

  console.log(
    formatSummary(
      summarize(rows, {
        length: args.length,
        seed: args.seed,
        allowCube: args.allowCube,
        sides: { a: args.a.label, b: args.b.label },
      }),
    ),
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
