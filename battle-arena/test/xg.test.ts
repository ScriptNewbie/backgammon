import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { openingPosition, stepsKey, type Position } from "ts-core";
import { XgClient } from "ts-core/xg";
import { parseArgs } from "../src/cli.ts";
import { createXgDriver } from "../src/drivers/xg.ts";

const FIXTURES = new URL("../../ts-core/test/fixtures/xg/", import.meta.url);
const byXgid = new Map<string, string>();
for (const name of readdirSync(FIXTURES)) {
  const text = readFileSync(new URL(name, FIXTURES), "utf8");
  byXgid.set(`${name.startsWith("cube-") ? "cube" : "checker"} ${text.split("\n")[0]!.trim()}`, text);
}

const queries: { xgid: string; kind: string }[] = [];
let failNext = 0;
let server: Server;
let baseUrl = "";

before(async () => {
  server = createServer((req, res) => {
    if (req.url === "/health") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, version: "eXtreme Gammon 2.10" }));
      return;
    }
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const body = JSON.parse(raw) as { xgid: string; kind: string };
      queries.push(body);
      const text = byXgid.get(`${body.kind} ${body.xgid}`);
      res.setHeader("content-type", "application/json");
      if (failNext > 0) {
        failNext -= 1;
        res.statusCode = 422;
        res.end(JSON.stringify({ ok: false, error: "XG did not answer export command 132" }));
        return;
      }
      if (!text) {
        res.statusCode = 422;
        res.end(JSON.stringify({ ok: false, error: "Invalid position: The position cannot be imported" }));
        return;
      }
      res.end(JSON.stringify({ ok: true, text }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

const ctx = { matchId: "m", gameId: "g", ply: 3, phase: "pre" as const };

function hitPosition(): Position {
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  pos.points[0] = -1;
  pos.points[2] = -1;
  pos.dice = [3, 1];
  return pos;
}

function racePosition(): Position {
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  pos.points = Array.from({ length: 24 }, () => 0);
  [3, 3, 3, 3, 2, 1].forEach((n, i) => (pos.points[i] = n));
  for (let p = 19; p <= 23; p++) pos.points[p - 1] = -3;
  return pos;
}

test("health check reads the sidecar version", async () => {
  const client = new XgClient(baseUrl);
  await client.healthCheck();
  assert.equal(client.version, "eXtreme Gammon 2.10");
});

test("xg checker play is XG's top play with cubeless for the next mover", async () => {
  const driver = createXgDriver(new XgClient(baseUrl));
  const choice = await driver.chooseChecker(hitPosition(), ctx);
  assert.deepEqual(new Set(choice.steps.map((s) => stepsKey([s]))), new Set(["8/5", "6/5"]));
  assert.ok(choice.cubeless);
  assert.ok(Math.abs(choice.cubeless.win - 0.4666) < 1e-9);
});

test("xg offer and take come from XG", async () => {
  const driver = createXgDriver(new XgClient(baseUrl));
  const pos = racePosition();
  queries.length = 0;
  assert.equal(await driver.chooseOffer(pos, ctx), "double");
  assert.equal(await driver.chooseTake(pos, ctx), "drop");
  assert.deepEqual(queries, [{ xgid: "XGID=-CCCCBA------------ccccc--:0:0:1:00:0:0:0:7:6", kind: "cube" }]);
});

test("a sidecar error fails the decision", async () => {
  const driver = createXgDriver(new XgClient(baseUrl));
  const pos = hitPosition();
  pos.dice = [6, 5];
  await assert.rejects(driver.chooseChecker(pos, ctx), /422.*cannot be imported/);
});

test("a busy XG is retried, then the query succeeds", async () => {
  const driver = createXgDriver(new XgClient(baseUrl, 0));
  failNext = 2;
  queries.length = 0;
  const choice = await driver.chooseChecker(hitPosition(), ctx);
  assert.equal(choice.steps.length, 2);
  assert.equal(queries.length, 3);
});

test("a busy XG fails after three attempts", async () => {
  const driver = createXgDriver(new XgClient(baseUrl, 0));
  failNext = 3;
  queries.length = 0;
  await assert.rejects(driver.chooseChecker(hitPosition(), ctx), /did not answer/);
  assert.equal(queries.length, 3);
  failNext = 0;
});

test("an unreachable sidecar fails the health check fast", async () => {
  await assert.rejects(new XgClient("http://127.0.0.1:9").healthCheck(), /unreachable/);
});

test("CLI accepts xg, defaults its url, and drops ply", () => {
  const prev = process.env.XG_BASE_URL;
  delete process.env.XG_BASE_URL;
  try {
    const args = parseArgs(["--a", "game-engine", "--b", "xg", "--b-ply", "0"]);
    assert.equal(args.b.driver, "xg");
    assert.equal(args.b.url, "http://127.0.0.1:8091");
    assert.equal(args.b.label, "xg");
    assert.equal(args.b.ply, undefined);
    assert.match(args.warnings[0]!, /b \(xg\) does not support ply/);
  } finally {
    if (prev !== undefined) process.env.XG_BASE_URL = prev;
  }
});
