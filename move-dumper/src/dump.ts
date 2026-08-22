import { createWriteStream, fsync as fsyncCb } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { finished } from "node:stream/promises";
import { createGzip, type Gzip } from "node:zlib";
import { once } from "node:events";
import type { DumpRecord, Manifest } from "./types";
import { LEVELS, MATCH_LENGTHS, PAIRING_WEIGHTS, TEMPERATURES } from "./levels";

const fsync = promisify(fsyncCb);

export function batchStamp(now = new Date()): { batchId: string; createdAt: string } {
  const createdAt = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const compact = createdAt.replace(/:(\d{2}):(\d{2})Z$/, "$1$2Z");
  return { batchId: `${compact}-bgweb-api`, createdAt };
}

export function buildManifest(opts: {
  batchId: string;
  createdAt: string;
  seed: number;
  baseUrl: string;
  recordCount: number;
  plies?: number;
}): Manifest {
  const settings: Manifest["engine"]["settings"] = {
    play: "match",
    matchLengths: [...MATCH_LENGTHS],
    baseUrl: opts.baseUrl,
    cubefulLabels: true,
    seed: opts.seed,
    met: "kazaross-xg2",
    levels: [...LEVELS],
    pairingWeights: { ...PAIRING_WEIGHTS },
    temperatures: { ...TEMPERATURES },
  };
  if (opts.plies !== undefined) settings.plies = opts.plies;
  return {
    v: 1,
    batchId: opts.batchId,
    createdAt: opts.createdAt,
    recordsFile: "records.jsonl.gz",
    recordCount: opts.recordCount,
    engine: {
      name: "bgweb-api",
      version: "foochu/bgweb-api:latest",
      settings,
    },
  };
}

export class DumpWriter {
  private gzip: Gzip | null = null;
  private file: ReturnType<typeof createWriteStream>;
  private pending: string[] = [];
  private committed = 0;
  private closed = false;
  plies: number | undefined;

  private constructor(
    readonly dir: string,
    readonly batchId: string,
    readonly createdAt: string,
    readonly seed: number,
    readonly baseUrl: string,
  ) {
    this.file = createWriteStream(path.join(dir, "records.jsonl.gz"));
  }

  static async create(opts: {
    dumpsRoot: string;
    seed: number;
    baseUrl: string;
    now?: Date;
  }): Promise<DumpWriter> {
    const { batchId, createdAt } = batchStamp(opts.now);
    const dir = path.join(opts.dumpsRoot, batchId);
    await mkdir(path.join(dir, "replay"), { recursive: true });
    const writer = new DumpWriter(dir, batchId, createdAt, opts.seed, opts.baseUrl);
    if (writer.file.fd == null) await once(writer.file, "open");
    await writer.writeManifest(0);
    return writer;
  }

  async writeRecord(record: DumpRecord): Promise<void> {
    this.pending.push(`${JSON.stringify(record)}\n`);
  }

  /** Close a gzip member so finished matches stay readable if the process dies. */
  async commitMatch(): Promise<void> {
    if (this.pending.length === 0) return;
    const gzip = createGzip();
    gzip.pipe(this.file, { end: false });
    this.gzip = gzip;
    for (const line of this.pending) {
      const ok = gzip.write(line);
      if (!ok) await once(gzip, "drain");
    }
    this.committed += this.pending.length;
    this.pending = [];
    gzip.end();
    await finished(gzip);
    this.gzip = null;
    await this.writeManifest(this.committed);
    if (typeof this.file.fd === "number") await fsync(this.file.fd);
  }

  async writeSgf(matchId: string, sgf: string): Promise<void> {
    await writeFile(path.join(this.dir, "replay", `${matchId}.sgf`), sgf, "utf8");
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
      plies: this.plies,
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
    await this.commitMatch();
    this.file.end();
    await finished(this.file);
    await this.writeManifest(this.committed);
    return { dir: this.dir, recordCount: this.committed };
  }
}
