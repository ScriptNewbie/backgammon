import { createWriteStream, fsync as fsyncCb } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { finished } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { once } from "node:events";
import type { GnubgFilter } from "ts-core/gnubg";
import type { DumpRecord, Manifest } from "./types";
import { LEVELS, PAIRING_WEIGHTS, TEMPERATURES } from "./levels";

const fsync = promisify(fsyncCb);

export function batchStamp(now = new Date()): { batchId: string; createdAt: string } {
  const createdAt = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const compact = createdAt.replace(/:(\d{2}):(\d{2})Z$/, "$1$2Z");
  return { batchId: `${compact}-gnubg`, createdAt };
}

export function buildManifest(opts: {
  batchId: string;
  createdAt: string;
  seed: number;
  baseUrl: string;
  recordCount: number;
  ply: number;
  labelFilter: GnubgFilter;
  version: string;
}): Manifest {
  const settings: Manifest["engine"]["settings"] = {
    play: "game",
    baseUrl: opts.baseUrl,
    cubefulLabels: false,
    ply: opts.ply,
    labelFilter: opts.labelFilter,
    seed: opts.seed,
    levels: [...LEVELS],
    pairingWeights: { ...PAIRING_WEIGHTS },
    temperatures: { ...TEMPERATURES },
  };

  return {
    v: 1,
    batchId: opts.batchId,
    createdAt: opts.createdAt,
    recordsFile: "records.jsonl.gz",
    recordCount: opts.recordCount,
    engine: {
      name: "gnubg",
      version: opts.version,
      settings,
    },
  };
}

export class DumpWriter {
  private file: ReturnType<typeof createWriteStream>;
  private commits: Promise<void> = Promise.resolve();
  private committed = 0;
  private closed = false;

  private constructor(
    readonly dir: string,
    readonly batchId: string,
    readonly createdAt: string,
    readonly seed: number,
    readonly baseUrl: string,
    readonly ply: number,
    readonly labelFilter: GnubgFilter,
    readonly version: string,
  ) {
    this.file = createWriteStream(path.join(dir, "records.jsonl.gz"));
  }

  static async create(opts: {
    dumpsRoot: string;
    seed: number;
    baseUrl: string;
    ply: number;
    labelFilter: GnubgFilter;
    version: string;
    now?: Date;
  }): Promise<DumpWriter> {
    const { batchId, createdAt } = batchStamp(opts.now);
    const dir = path.join(opts.dumpsRoot, batchId);
    await mkdir(path.join(dir, "replay"), { recursive: true });
    const writer = new DumpWriter(dir, batchId, createdAt, opts.seed, opts.baseUrl, opts.ply, opts.labelFilter, opts.version);
    if (writer.file.fd == null) await once(writer.file, "open");
    await writer.writeManifest(0);
    return writer;
  }

  /**
   * Append one game's records as its own gzip member, so finished games stay readable if the
   * process dies. Games played in parallel commit one at a time, in the order they finish.
   */
  commitGame(records: readonly DumpRecord[]): Promise<void> {
    const run = this.commits.then(() => this.writeMember(records));
    this.commits = run.catch(() => undefined);
    return run;
  }

  private async writeMember(records: readonly DumpRecord[]): Promise<void> {
    if (records.length === 0) return;
    const gzip = createGzip();
    gzip.pipe(this.file, { end: false });
    for (const record of records) {
      const ok = gzip.write(`${JSON.stringify(record)}\n`);
      if (!ok) await once(gzip, "drain");
    }
    gzip.end();
    await finished(gzip);
    this.committed += records.length;
    await this.writeManifest(this.committed);
    if (typeof this.file.fd === "number") await fsync(this.file.fd);
  }

  async writeSgf(gameId: string, sgf: string): Promise<void> {
    await writeFile(path.join(this.dir, "replay", `${gameId}.sgf`), sgf, "utf8");
  }

  get recordCount(): number {
    return this.committed;
  }

  private async writeManifest(recordCount: number): Promise<void> {
    const manifest = buildManifest({
      batchId: this.batchId,
      createdAt: this.createdAt,
      seed: this.seed,
      baseUrl: this.baseUrl,
      recordCount,
      ply: this.ply,
      labelFilter: this.labelFilter,
      version: this.version,
    });
    await writeFile(
      path.join(this.dir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
  }

  async finish(): Promise<{ dir: string; recordCount: number }> {
    if (this.closed) return { dir: this.dir, recordCount: this.committed };
    this.closed = true;
    await this.commits;
    this.file.end();
    await finished(this.file);
    await this.writeManifest(this.committed);
    return { dir: this.dir, recordCount: this.committed };
  }
}
