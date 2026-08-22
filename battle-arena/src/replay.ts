import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export function batchStamp(now = new Date()): { batchId: string; createdAt: string } {
  const createdAt = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const compact = createdAt.replace(/:(\d{2}):(\d{2})Z$/, "$1$2Z");
  return { batchId: `${compact}-engine-vs-teacher`, createdAt };
}

export async function writeMatchSgf(opts: {
  replaysRoot: string;
  batchId: string;
  matchId: string;
  sgf: string;
}): Promise<string> {
  const dir = path.join(opts.replaysRoot, opts.batchId);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${opts.matchId}.sgf`);
  await writeFile(file, opts.sgf, "utf8");
  return file;
}
