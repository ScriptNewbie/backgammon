import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgs, playersForSeats, seatsForMatch } from "../src/cli.ts";
import { engineUrl } from "../src/drivers/game-engine.ts";
import type { MatchPlayer } from "ts-core/sim";

test("CLI defaults to game-engine vs gnubg at 2-ply", () => {
  const prevT = process.env.GNUBG_BASE_URL;
  const prevE = process.env.ENGINE_BASE_URL;
  const prevH = process.env.HEDGEHOG_BASE_URL;
  delete process.env.GNUBG_BASE_URL;
  delete process.env.ENGINE_BASE_URL;
  delete process.env.HEDGEHOG_BASE_URL;
  try {
    const args = parseArgs([]);
    assert.equal(args.matches, 1);
    assert.equal(args.seed, 1);
    assert.equal(args.length, 7);
    assert.equal(args.allowCube, true);
    assert.equal(args.a.driver, "game-engine");
    assert.equal(args.a.url, "http://127.0.0.1:3000");
    assert.equal(args.a.ply, undefined);
    assert.equal(args.a.label, "game-engine");
    assert.equal(args.b.driver, "gnubg");
    assert.equal(args.b.url, "http://127.0.0.1:8080");
    assert.equal(args.b.ply, 2);
    assert.equal(args.b.label, "gnubg-ply2");
    assert.deepEqual(args.warnings, []);
  } finally {
    if (prevT === undefined) delete process.env.GNUBG_BASE_URL;
    else process.env.GNUBG_BASE_URL = prevT;
    if (prevE === undefined) delete process.env.ENGINE_BASE_URL;
    else process.env.ENGINE_BASE_URL = prevE;
    if (prevH === undefined) delete process.env.HEDGEHOG_BASE_URL;
    else process.env.HEDGEHOG_BASE_URL = prevH;
  }
});

test("each side keeps its own driver, url, and ply", () => {
  const args = parseArgs([
    "--a",
    "hedgehog",
    "--a-url",
    "http://hedgehog-a:8090",
    "--a-ply",
    "0",
    "--b",
    "hedgehog",
    "--b-url",
    "http://hedgehog-b:8091",
    "--b-ply",
    "1",
  ]);
  assert.equal(args.a.driver, "hedgehog");
  assert.equal(args.a.url, "http://hedgehog-a:8090");
  assert.equal(args.a.ply, 0);
  assert.equal(args.a.label, "hedgehog-ply0");
  assert.equal(args.b.driver, "hedgehog");
  assert.equal(args.b.url, "http://hedgehog-b:8091");
  assert.equal(args.b.ply, 1);
  assert.equal(args.b.label, "hedgehog-ply1");
  assert.deepEqual(args.warnings, []);
});

test("hedgehog ply defaults to 1", () => {
  const args = parseArgs(["--b", "hedgehog"]);
  assert.equal(args.b.ply, 1);
  assert.equal(args.b.label, "hedgehog-ply1");
  assert.deepEqual(args.warnings, []);
});

test("ply on a driver that does not support it is dropped", () => {
  const args = parseArgs(["--a-ply", "0", "--b", "xg", "--b-ply", "1"]);
  assert.equal(args.a.driver, "game-engine");
  assert.equal(args.a.ply, undefined);
  assert.equal(args.b.driver, "xg");
  assert.equal(args.b.ply, undefined);
  assert.equal(args.warnings.length, 2);
  assert.match(args.warnings[0]!, /a \(game-engine\) does not support ply/);
  assert.match(args.warnings[1]!, /b \(xg\) does not support ply/);
});

test("gnubg takes ply 0-4; teacher is an old name for it", () => {
  const args = parseArgs(["--a", "gnubg", "--a-ply", "3", "--b", "teacher"]);
  assert.equal(args.a.label, "gnubg-ply3");
  assert.equal(args.b.driver, "gnubg");
  assert.equal(args.b.ply, 2);
  assert.match(args.warnings[0]!, /--b teacher is now gnubg/);
});

test("CLI --no-cube disables cube", () => {
  const args = parseArgs(["--no-cube"]);
  assert.equal(args.allowCube, false);
});

test("CLI rejects even match length", () => {
  assert.throws(() => parseArgs(["--length", "2"]), /--length/);
});

test("CLI rejects ply that is not an integer 0-4", () => {
  assert.throws(() => parseArgs(["--a-ply", "5"]), /--a-ply must be an integer 0-4/);
  assert.throws(() => parseArgs(["--b-ply", "1.5"]), /--b-ply must be an integer 0-4/);
  assert.throws(() => parseArgs(["--a-ply", "-1"]), /--a-ply must be an integer 0-4/);
});

test("hedgehog ply above 1 is an error, not a warning", () => {
  assert.throws(() => parseArgs(["--b", "hedgehog", "--b-ply", "2"]), /--b-ply 2 is above hedgehog's maximum 1/);
});

test("game-engine-fast takes ply 0-4, default 0, own URL", () => {
  const prev = process.env.FAST_ENGINE_BASE_URL;
  delete process.env.FAST_ENGINE_BASE_URL;
  try {
    const args = parseArgs(["--a", "game-engine-fast", "--b", "game-engine-fast", "--b-ply", "4"]);
    assert.equal(args.a.driver, "game-engine-fast");
    assert.equal(args.a.url, "http://127.0.0.1:3001");
    assert.equal(args.a.ply, 0);
    assert.equal(args.a.label, "game-engine-fast-ply0");
    assert.equal(args.b.ply, 4);
    assert.equal(args.b.label, "game-engine-fast-ply4");
    assert.deepEqual(args.warnings, []);
  } finally {
    if (prev === undefined) delete process.env.FAST_ENGINE_BASE_URL;
    else process.env.FAST_ENGINE_BASE_URL = prev;
  }
});

test("engine route URLs carry ply only when set", () => {
  assert.equal(engineUrl("http://game-engine:3000", "evaluate"), "http://game-engine:3000/evaluate");
  assert.equal(engineUrl("http://game-engine-fast:3001/", "evaluate", 2), "http://game-engine-fast:3001/evaluate?ply=2");
  assert.equal(engineUrl("http://game-engine-fast:3001", "cube", 0), "http://game-engine-fast:3001/cube?ply=0");
  assert.equal(engineUrl("http://game-engine:3000", "cube"), "http://game-engine:3000/cube");
});

test("CLI rejects an unknown driver", () => {
  assert.throws(() => parseArgs(["--a", "bgweb"]), /--a/);
});

test("removed opponent flags name the replacement", () => {
  assert.throws(() => parseArgs(["--opponent", "hedgehog"]), /--opponent was removed/);
  assert.throws(() => parseArgs(["--ply", "1"]), /--a-ply/);
  assert.throws(() => parseArgs(["--engine-url", "http://x"]), /--a-url/);
});

test("seats alternate", () => {
  assert.deepEqual(seatsForMatch(0, "game-engine", "teacher"), {
    aSeat: "p1",
    labels: { p1: "game-engine", p2: "teacher" },
  });
  assert.deepEqual(seatsForMatch(1, "game-engine", "hedgehog-ply1"), {
    aSeat: "p2",
    labels: { p1: "hedgehog-ply1", p2: "game-engine" },
  });
});

test("playersForSeats swaps drivers", () => {
  const a = { name: "a" } as unknown as MatchPlayer;
  const b = { name: "b" } as unknown as MatchPlayer;
  assert.equal(playersForSeats("p1", a, b).p1, a);
  assert.equal(playersForSeats("p2", a, b).p1, b);
});
