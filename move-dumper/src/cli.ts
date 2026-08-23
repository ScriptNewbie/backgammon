import path from "node:path";
import { fileURLToPath } from "node:url";
import { BgwebClient } from "ts-core/bgweb";
import { Rng } from "ts-core/sim";
import { DumpWriter } from "./dump";
import { dumpGames } from "./games";

export type CliArgs = {
  games: number;
  seed: number;
  baseUrl: string;
};

export function parseArgs(argv: string[]): CliArgs {
  let games = 1;
  let seed = 1;
  let baseUrl = process.env.BGWEB_BASE_URL ?? "http://127.0.0.1:8080";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--games") games = Number(argv[++i]);
    else if (arg === "--matches" || arg === "--length") {
      throw new Error("dumper plays games, not matches; use --games N (no --length / --matches)");
    } else if (arg === "--seed") seed = Number(argv[++i]);
    else if (arg === "--base-url") baseUrl = argv[++i]!;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  if (!Number.isInteger(games) || games < 1) {
    throw new Error(`--games must be a positive integer (got ${games})`);
  }
  if (!Number.isInteger(seed)) {
    throw new Error(`--seed must be an integer (got ${seed})`);
  }
  return { games, seed, baseUrl };
}

function printHelp(): void {
  console.log(`Usage: npm run dump -- [--games N] [--seed N] [--base-url URL]

Simulate money games (no cube) and dump labelled checker plays from bgweb-api.

  --games      Number of games (default 1)
  --seed       RNG seed stored on the batch manifest (default 1)
  --base-url   bgweb-api origin (default http://127.0.0.1:8080, or BGWEB_BASE_URL)

From move-dumper/ (npm wraps Docker Compose):
  npm run up
  npm test
  npm run dump -- --games 1 --seed 1
  npm run down
  npm run install:host
`);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const client = new BgwebClient(args.baseUrl);
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
