import path from "node:path";
import { fileURLToPath } from "node:url";
import { GNUBG_MAX_PLY, GnubgClient, type GnubgFilter } from "ts-core/gnubg";
import { Rng } from "ts-core/sim";
import { DumpWriter } from "./dump";
import { dumpGames } from "./games";

export type CliArgs = {
  games: number;
  seed: number;
  baseUrl: string;
  ply: number;
  labelFilter: GnubgFilter;
};

export function parseArgs(argv: string[]): CliArgs {
  let games = 1;
  let seed = 1;
  let baseUrl = process.env.GNUBG_BASE_URL ?? "http://127.0.0.1:8080";
  // GnuBG world class: 2-ply with its own move filter, which is how bgweb-api labelled.
  let ply = 2;
  let labelFilter: string = "gnubg";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--games") games = Number(argv[++i]);
    else if (arg === "--matches" || arg === "--length") {
      throw new Error("dumper plays games, not matches; use --games N (no --length / --matches)");
    } else if (arg === "--seed") seed = Number(argv[++i]);
    else if (arg === "--base-url") baseUrl = argv[++i]!;
    else if (arg === "--ply") ply = Number(argv[++i]);
    else if (arg === "--label-filter") labelFilter = argv[++i]!;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else throw new Error(`unknown argument ${arg} (see --help)`);
  }
  if (!Number.isInteger(games) || games < 1) {
    throw new Error(`--games must be a positive integer (got ${games})`);
  }
  if (!Number.isInteger(seed)) {
    throw new Error(`--seed must be an integer (got ${seed})`);
  }
  if (!Number.isInteger(ply) || ply < 0 || ply > GNUBG_MAX_PLY) {
    throw new Error(`--ply must be an integer 0-${GNUBG_MAX_PLY} (got ${ply})`);
  }
  if (labelFilter !== "gnubg" && labelFilter !== "all") {
    throw new Error(`--label-filter must be gnubg or all (got ${labelFilter})`);
  }
  return { games, seed, baseUrl, ply, labelFilter: labelFilter as GnubgFilter };
}

function printHelp(): void {
  console.log(`Usage: docker compose --profile dumper run --rm dumper npm run dump:inner -- [--games N] [--seed N] [--ply N] [--label-filter gnubg|all] [--base-url URL]

Simulate money games (no cube) and dump checker plays labelled by GNU Backgammon (gnubg sidecar).

  --games         Number of games (default 1)
  --seed          RNG seed stored on the batch manifest (default 1)
  --ply           GnuBG ply, 0-4 (default 2: GnuBG world class, as bgweb-api labelled)
  --label-filter  gnubg: GnuBG's own move filter, top plays at --ply and the rest shallower
                  (default, as bgweb-api labelled). all: every play searched at --ply.
  --base-url      gnubg sidecar origin (default http://127.0.0.1:8080, or GNUBG_BASE_URL)

From move-dumper/ (see README.md):
  docker compose up -d
  docker compose --profile test run --rm test
  docker compose --profile dumper run --rm dumper npm run dump:inner -- --games 1 --seed 1
  docker compose down
`);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const client = new GnubgClient(args.baseUrl, args.ply, args.labelFilter);
  try {
    await client.healthCheck();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exitCode = 1;
    return;
  }

  const packageRoot = fileURLToPath(new URL("..", import.meta.url));
  const dumpsRoot = path.join(packageRoot, "dumps");
  const writer = await DumpWriter.create({
    dumpsRoot,
    seed: args.seed,
    baseUrl: args.baseUrl,
    ply: args.ply,
    labelFilter: args.labelFilter,
    version: client.version,
  });
  let stop = false;
  const requestStop = (): void => {
    if (stop) return;
    stop = true;
    console.error("stop requested; finishing after the current game");
  };
  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);
  const rng = new Rng(args.seed);
  try {
    await dumpGames(client, rng, writer, args.games, () => stop);
  } finally {
    process.off("SIGINT", requestStop);
    process.off("SIGTERM", requestStop);
    const { dir, recordCount } = await writer.finish();
    console.log(`Wrote ${recordCount} records to ${dir}`);
  }
}

const thisFile = fileURLToPath(import.meta.url);
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked && path.normalize(invoked) === path.normalize(thisFile)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
