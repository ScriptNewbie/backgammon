// HTTP sidecar for the GNU Backgammon command line (docs/domain/gnubg.md, ADR 0031).
//
// GPL boundary: this file is ours and contains no GNU Backgammon code. It runs the
// Debian `gnubg` binary as a separate process and talks to it only through its text
// command line over pipes. It does not link gnubg, load its libraries, or use its
// embedded Python. The image installs gnubg from Debian at build time; the repo holds
// none of it.
//
// GET  /health
// POST /v1/query  {"xgid":"XGID=...","kind":"checker"|"cube","ply":0..4,"filter":"gnubg"|"all"}
//   -> {"ok":true,"text":"<gnubg hint output>"}   (parsed by ts-core/gnubg)
//
// `filter: "gnubg"` keeps GnuBG's own move filters (its top candidates searched at `ply`,
// the rest left at lower ply), which is how GnuBG plays. `filter: "all"` searches every
// legal play at `ply`, which is what training labels need. Each filter has its own
// process pool, so settings never leak between them.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { availableParallelism } from "node:os";

const API_VERSION = 1;
const PORT = Number(process.env.PORT ?? 8080);
const WORKERS = Math.max(1, Number(process.env.GNUBG_WORKERS || availableParallelism()));
const TIMEOUT_MS = Number(process.env.GNUBG_TIMEOUT_MS || 600_000);
const MAX_PLY = 4;
const GNUBG = process.env.GNUBG_BIN ?? "/usr/games/gnubg";

// Every XGID field is short and alphanumeric. Nothing else reaches the gnubg command line.
const XGID = /^XGID=[-a-oA-O]{26}(?::-?[0-9A-Z]{1,3}){9}$/;
const ERROR_LINE = /^(Illegal position|Invalid|You must|No game in progress|.*is not a legal).*$/m;

const BASE_SETTINGS = [
  "set display off",
  "set output digits 6",
  "set player 0 human",
  "set player 1 human",
  "set jacoby off",
];

// Keep every play at every intermediate ply up to MAX_PLY.
const ALL_MOVES_FILTER = [];
for (let ply = 1; ply <= MAX_PLY; ply++) {
  for (let level = 0; level < ply; level++) {
    ALL_MOVES_FILTER.push(`set evaluation movefilter ${ply} ${level} 999 0 0`);
  }
}

let version = "";
let seq = 0;

class Worker {
  constructor(filter) {
    this.filter = filter;
    this.buffer = "";
    this.waiter = null;
    this.ready = this.start();
  }

  async start() {
    this.buffer = "";
    // One pipe for stdout and stderr, line buffered, so output and the error-stream
    // sentinel arrive in the order gnubg wrote them.
    this.proc = spawn("sh", ["-c", `exec stdbuf -oL -eL ${GNUBG} -t -q 2>&1`], {
      stdio: ["pipe", "pipe", "inherit"],
    });
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk) => {
      this.buffer += chunk;
      this.check();
    });
    this.proc.on("exit", (code) => {
      if (this.waiter) this.waiter.reject(new Error(`gnubg exited (${code})`));
      this.waiter = null;
      this.proc = null;
    });
    const banner = await this.send([
      ...BASE_SETTINGS,
      ...(this.filter === "all" ? ALL_MOVES_FILTER : []),
    ]);
    const line = banner.split("\n").find((l) => l.startsWith("GNU Backgammon "));
    if (line && !version) version = line.trim();
  }

  check() {
    if (!this.waiter) return;
    const at = this.buffer.indexOf(this.waiter.marker);
    if (at < 0) return;
    const lineStart = this.buffer.lastIndexOf("\n", at) + 1;
    const text = this.buffer.slice(0, lineStart);
    const lineEnd = this.buffer.indexOf("\n", at);
    this.buffer = lineEnd < 0 ? "" : this.buffer.slice(lineEnd + 1);
    const { resolve, timer } = this.waiter;
    clearTimeout(timer);
    this.waiter = null;
    resolve(text);
  }

  send(commands) {
    if (!this.proc) return Promise.reject(new Error("gnubg is not running"));
    const sentinel = `zz-end-${++seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        this.proc?.kill("SIGKILL");
        reject(new Error(`gnubg did not finish within ${TIMEOUT_MS} ms`));
      }, TIMEOUT_MS);
      this.waiter = { marker: `\`${sentinel}'`, resolve, reject, timer };
      this.proc.stdin.write(`${commands.join("\n")}\n${sentinel}\n`);
      this.check();
    });
  }

  async query({ xgid, kind, ply }) {
    if (!this.proc) this.ready = this.start();
    await this.ready;
    return this.send([
      `set evaluation chequerplay evaluation plies ${ply}`,
      `set evaluation cubedecision evaluation plies ${ply}`,
      `set xgid ${xgid}`,
      kind === "checker" ? "hint 999" : "hint",
    ]);
  }
}

class Pool {
  constructor(filter) {
    this.filter = filter;
    this.idle = [];
    this.size = 0;
    this.queue = [];
  }

  async run(job) {
    const worker = await this.acquire();
    try {
      return await worker.query(job);
    } finally {
      this.release(worker);
    }
  }

  acquire() {
    const idle = this.idle.pop();
    if (idle) return Promise.resolve(idle);
    if (this.size < WORKERS) {
      this.size += 1;
      return Promise.resolve(new Worker(this.filter));
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  release(worker) {
    const next = this.queue.shift();
    if (next) next(worker);
    else this.idle.push(worker);
  }
}

const pools = { gnubg: new Pool("gnubg"), all: new Pool("all") };

function parseJob(body) {
  const { xgid, kind, ply = 0, filter = "gnubg" } = body ?? {};
  if (typeof xgid !== "string" || !XGID.test(xgid)) return { error: "xgid must be a single XGID=... string" };
  if (kind !== "checker" && kind !== "cube") return { error: 'kind must be "checker" or "cube"' };
  if (!Number.isInteger(ply) || ply < 0 || ply > MAX_PLY) return { error: `ply must be an integer 0-${MAX_PLY}` };
  if (filter !== "gnubg" && filter !== "all") return { error: 'filter must be "gnubg" or "all"' };
  return { job: { xgid, kind, ply, filter } };
}

function reply(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    pools.gnubg
      .run({ xgid: "XGID=-b----E-C---eE---c-e----B-:0:0:1:00:0:0:0:0:10", kind: "cube", ply: 0 })
      .then(() => reply(res, 200, { ok: true, version, api: API_VERSION, workers: WORKERS, maxPly: MAX_PLY }))
      .catch((err) => reply(res, 503, { ok: false, error: String(err.message ?? err) }));
    return;
  }
  if (req.method !== "POST" || req.url !== "/v1/query") {
    reply(res, 404, { ok: false, error: "not found" });
    return;
  }
  let raw = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > 4096) req.destroy();
  });
  req.on("end", async () => {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      reply(res, 400, { ok: false, error: "body must be JSON" });
      return;
    }
    const { job, error } = parseJob(body);
    if (error) {
      reply(res, 400, { ok: false, error });
      return;
    }
    try {
      const text = await pools[job.filter].run(job);
      const bad = text.match(ERROR_LINE);
      if (bad) {
        reply(res, 422, { ok: false, error: `gnubg: ${bad[0].trim()}`, text });
        return;
      }
      reply(res, 200, { ok: true, text });
    } catch (err) {
      reply(res, 503, { ok: false, error: String(err.message ?? err) });
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.error(`gnubg sidecar api ${API_VERSION} on :${PORT}, ${WORKERS} worker(s) per filter, max ply ${MAX_PLY}`);
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(0));
