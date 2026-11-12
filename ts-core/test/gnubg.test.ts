import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";
import { applySteps, openingMoneyPosition, stepsKey } from "../src/board.ts";
import {
  GnubgClient,
  gnubgLabels,
  parseGnubgCube,
  parseGnubgHint,
} from "../src/gnubg.ts";
import { generateLegalPlays } from "../src/moves.ts";
import { positionToXgid } from "../src/xg.ts";
import { positionFromXgid } from "./xgid-helper.ts";

const FIXTURES = new URL("./fixtures/gnubg/", import.meta.url);

/** First line is the XGID the text was produced for; the rest is the sidecar's `text`. */
function fixture(name: string): { xgid: string; text: string } {
  const raw = readFileSync(new URL(`${name}.txt`, FIXTURES), "utf8");
  const nl = raw.indexOf("\n");
  return { xgid: raw.slice(0, nl).trim(), text: raw.slice(nl + 1) };
}

test("money 3-1 at 0-ply lists every play with 6-digit probabilities", () => {
  const { text } = fixture("checker-money-31-ply0-all");
  const lines = parseGnubgHint(text);
  assert.equal(lines.length, 16);
  assert.deepEqual(lines[0], {
    rank: 1,
    cubeful: true,
    ply: 0,
    notation: "8/5 6/5",
    equity: 0.218154,
    probs: { win: 0.550952, gammon: 0.173708, backgammon: 0.012809, lose: 0.449048, loseGammon: 0.124388, loseBackgammon: 0.005021 },
  });
});

test("labels flip to the side to move after the play and match bgweb-api's 0-ply numbers", () => {
  const { xgid, text } = fixture("checker-money-31-ply0-all");
  const pos = positionFromXgid(xgid);
  const plays = gnubgLabels(pos, parseGnubgHint(text), 0);
  assert.equal(plays.length, new Set(generateLegalPlays(pos).map((s) => JSON.stringify(applySteps(pos, s).points))).size);
  const best = plays[0]!;
  assert.deepEqual(new Set(best.steps.map((s) => `${s.from}/${s.to}`)), new Set(["8/5", "6/5"]));
  assert.equal(best.eval.source, "gnubg");
  assert.equal(best.eval.cubeAction, null);
  assert.equal(best.eval.cubefulEquity, -0.218154);
  assert.equal(best.eval.cubeless.win, 0.449048);
  assert.equal(best.eval.cubeless.loseGammon, 0.173708);
  // bgweb-api (same nets, 0-ply, 3 decimals): cubeless eq +0.159 for the mover, cubeful +0.218.
  assert.ok(Math.abs(best.eval.cubeless.equity + 0.159) < 0.001);
  assert.equal(best.teacherDiff, 0);
  assert.ok(plays.slice(1).every((p) => p.teacherDiff <= 0));
});

test("all-moves labels at 1-ply are all 1-ply; asking for another depth fails", () => {
  const { xgid, text } = fixture("checker-money-64-ply1-all");
  const pos = positionFromXgid(xgid);
  const lines = parseGnubgHint(text);
  assert.ok(lines.every((l) => l.ply === 1));
  assert.equal(gnubgLabels(pos, lines, 1).length, lines.length);
  assert.throws(() => gnubgLabels(pos, lines, 2), /searched at 1-ply, not 2-ply/);
});

test("gnubg's own filter leaves some plays at lower ply: only the gnubg label filter accepts it", () => {
  const { xgid, text } = fixture("checker-money-64-ply2-gnubg");
  const lines = parseGnubgHint(text);
  assert.equal(lines[0]!.ply, 2);
  assert.ok(lines.some((l) => l.ply === 0));
  assert.throws(() => gnubgLabels(positionFromXgid(xgid), lines, 2), /searched at 0-ply/);
  // That is exactly how bgweb-api labelled (2-ply, gnubg's filter), so the gnubg filter accepts it.
  assert.equal(gnubgLabels(positionFromXgid(xgid), lines, 2, "gnubg").length, lines.length);
  assert.throws(() => gnubgLabels(positionFromXgid(xgid), lines, 1, "gnubg"), /searched at 2-ply, not 1-ply/);
});

test("p2's play is mover-relative and lands on our board", () => {
  const { xgid, text } = fixture("checker-p2-42-match");
  const pos = positionFromXgid(xgid);
  assert.equal(pos.onRoll, "p2");
  const lines = parseGnubgHint(text);
  assert.equal(lines[0]!.notation, "8/4 6/4");
  const plays = gnubgLabels(pos, lines, 0);
  // p2's 4-point is our point 21.
  assert.equal(applySteps(pos, plays[0]!.steps).points[20], -2);
});

test("a dance is an empty list; a bear-off lists both boards", () => {
  assert.deepEqual(parseGnubgHint(fixture("checker-dance").text), []);
  const { xgid, text } = fixture("checker-bearoff");
  const pos = positionFromXgid(xgid);
  assert.equal(gnubgLabels(pos, parseGnubgHint(text), 1).length, 2);
});

test("cube wording maps to offer and take", () => {
  const cases: [string, "double" | "no-double", "take" | "drop" | null][] = [
    ["cube-no-double", "no-double", "take"],
    ["cube-no-redouble", "no-double", "take"],
    ["cube-double-take", "double", "take"],
    ["cube-double-pass", "double", "drop"],
    ["cube-too-good", "no-double", "drop"],
    ["cube-cannot-double", "no-double", null],
    ["cube-crawford", "no-double", null],
  ];
  for (const [name, offer, take] of cases) {
    const { xgid, text } = fixture(name);
    const analysis = parseGnubgCube(xgid, text);
    assert.equal(analysis.offer, offer, name);
    assert.equal(analysis.take, take, name);
  }
});

test("unrecognised gnubg text fails instead of guessing", () => {
  assert.throws(() => parseGnubgCube("x", "Proper cube action: Maybe double, take (1%)\n"), /not recognised/);
  assert.throws(() => parseGnubgCube("x", "nothing here\n"), /no Proper cube action/);
  assert.throws(() => parseGnubgHint("nothing here\n"), /no analysed checker play/);
  const { xgid, text } = fixture("checker-money-31-ply0-all");
  const lines = parseGnubgHint(text);
  assert.throws(() => gnubgLabels(positionFromXgid(xgid), lines.slice(1), 0), /listed 15 plays; we have 16/);
});

// --- client against a fake sidecar -----------------------------------------------------

type Query = { xgid: string; kind: string; ply: number; filter: string };
const queries: Query[] = [];
let health: Record<string, unknown> = {};
let server: Server;
let baseUrl = "";

before(async () => {
  server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/health") {
      res.end(JSON.stringify(health));
      return;
    }
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const body = JSON.parse(raw) as Query;
      queries.push(body);
      const name =
        body.kind === "cube"
          ? "cube-double-take"
          : body.filter === "all"
            ? "checker-money-31-ply0-all"
            : "checker-p2-42-match";
      res.end(JSON.stringify({ ok: true, text: fixture(name).text }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

beforeEach(() => {
  queries.length = 0;
  health = { ok: true, version: "GNU Backgammon 1.07.001", api: 1 };
});

test("getMoves labels a money game with a live centered cube, every play at the client's ply", async () => {
  const pos = openingMoneyPosition();
  pos.dice = [3, 1];
  // The dumper turns the cube off; labels still price a live centered cube, as bgweb-api did.
  pos.cube.mayDouble = { p1: false, p2: false };
  const { plays, ply } = await new GnubgClient(baseUrl, 0, "all").getMoves(pos);
  assert.equal(ply, 0);
  assert.equal(plays.length, 16);
  assert.deepEqual(queries, [
    { xgid: "XGID=-b----E-C---eE---c-e----B-:0:0:1:31:0:0:0:0:6", kind: "checker", ply: 0, filter: "all" },
  ]);
});

test("getMoves defaults to gnubg's own filter", async () => {
  const pos = openingMoneyPosition();
  pos.dice = [3, 1];
  // The fake sidecar answers this filter with another position's text; only the request matters.
  await new GnubgClient(baseUrl, 0).getMoves(pos).catch(() => undefined);
  assert.equal(queries[0]!.filter, "gnubg");
});

test("getMoves skips the sidecar for a dance", async () => {
  const pos = positionFromXgid(fixture("checker-dance").xgid);
  assert.deepEqual(await new GnubgClient(baseUrl).getMoves(pos), { plays: [], ply: 0 });
  assert.equal(queries.length, 0);
});

test("chooseChecker is gnubg's top play with its own filter, at the real score and cube", async () => {
  const { xgid } = fixture("checker-p2-42-match");
  const pos = positionFromXgid(xgid);
  const choice = await new GnubgClient(baseUrl, 2).chooseChecker(pos);
  assert.equal(queries.length, 1);
  assert.equal(queries[0]!.filter, "gnubg");
  assert.equal(queries[0]!.ply, 2);
  assert.equal(queries[0]!.xgid, positionToXgid(pos));
  assert.ok(choice.cubeless);
  assert.equal(choice.cubeless.win, 0.46484);
  assert.ok(stepsKey(choice.steps).length > 0);
});

test("cubeAction asks once per position, without dice", async () => {
  const { xgid } = fixture("cube-double-take");
  const pos = positionFromXgid(xgid);
  const client = new GnubgClient(baseUrl, 1);
  const first = await client.cubeAction(pos);
  const second = await client.cubeAction({ ...pos, dice: [3, 1] });
  assert.equal(first.offer, "double");
  assert.equal(second.take, "take");
  assert.equal(queries.length, 1);
  assert.equal(queries[0]!.kind, "cube");
  assert.equal(queries[0]!.xgid, positionToXgid({ ...pos, dice: null }));
});

test("health check needs api 1; ply is bounded", async () => {
  const client = new GnubgClient(baseUrl);
  await client.healthCheck();
  assert.equal(client.version, "GNU Backgammon 1.07.001");
  health = { ok: true };
  await assert.rejects(new GnubgClient(baseUrl).healthCheck(), /rebuild it/);
  assert.throws(() => new GnubgClient(baseUrl, 5), /0-4/);
  await assert.rejects(new GnubgClient("http://127.0.0.1:9").healthCheck(), /unreachable/);
});

test("a decided bear-off prints -0.000000; it parses as 0 and labels under gnubg's filter", () => {
  const { xgid, text } = fixture("checker-decided-negative-zero");
  const lines = parseGnubgHint(text);
  const shallow = lines.find((l) => l.ply === 0)!;
  assert.equal(Object.is(shallow.probs.win, -0), false);
  assert.equal(shallow.probs.win, 0);
  const plays = gnubgLabels(positionFromXgid(xgid), lines, 2, "gnubg");
  assert.equal(plays.length, lines.length);
});

test("gnubg does not search a forced play; all-moves labels accept it at 0-ply", () => {
  const { xgid, text } = fixture("checker-forced-ply1-all");
  const lines = parseGnubgHint(text);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.ply, 0);
  assert.equal(gnubgLabels(positionFromXgid(xgid), lines, 1, "all").length, 1);
});
