import path from "node:path";
import { fileURLToPath } from "node:url";
import { BgwebClient } from "./bgweb";
import { DumpWriter } from "./dump";
import { dumpMatches } from "./match";
import { Rng } from "./rng";

export type CliArgs = {
  matches: number;
  seed: number;
  baseUrl: string;
  length?: number;
};

export function parseArgs(argv: string[]): CliArgs {
  let matches = 1;
  let seed = 1;
  let baseUrl = process.env.BGWEB_BASE_URL ?? "http://127.0.0.1:8080";
  let length: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--matches") matches = Number(argv[++i]);
    else if (arg === "--seed") seed = Number(argv[++i]);
    else if (arg === "--base-url") baseUrl = argv[++i]!;
    else if (arg === "--length") length = Number(argv[++i]);
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
  if (length !== undefined && ![1, 3, 5, 7, 9, 11, 13, 15].includes(length)) {
    throw new Error(`--length must be one of 1,3,5,7,9,11,13,15 (got ${length})`);
  }
  return { matches, seed, baseUrl, length };
}

function printHelp(): void {
  console.log(`Usage: docker compose --profile dumper run --rm dumper npm run dump -- [--matches N] [--seed N] [--base-url URL]

Simulate match play and dump labelled checker plays from bgweb-api.

  --matches    Number of matches (default 1)
  --seed       RNG seed stored on the batch manifest (default 1)
  --base-url   bgweb-api origin (default http://127.0.0.1:8080, or BGWEB_BASE_URL)
  --length     Optional match length (1,3,5,7,9,11,13,15). Default: sample uniformly.

From move-dumper/:
  docker compose up -d
  docker compose --profile dumper run --rm --no-deps dumper npm test
  docker compose --profile dumper run --rm dumper npm run dump -- --matches 1 --seed 1 --length 1
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
  const rng = new Rng(args.seed);
  await dumpMatches(client, rng, writer, args.matches, args.length);
  const { dir, recordCount } = await writer.finish();
  console.log(`Wrote ${recordCount} records to ${dir}`);
}

const thisFile = fileURLToPath(import.meta.url);
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked && path.normalize(invoked) === path.normalize(thisFile)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
