import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgs, playersForSeats, seatsForMatch } from "../src/cli.ts";
import type { MatchPlayer } from "ts-core/sim";

test("CLI defaults to game-engine vs teacher", () => {
  const prevT = process.env.BGWEB_BASE_URL;
  const prevE = process.env.ENGINE_BASE_URL;
  const prevH = process.env.HEDGEHOG_BASE_URL;
  delete process.env.BGWEB_BASE_URL;
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
    assert.equal(args.b.driver, "teacher");
    assert.equal(args.b.url, "http://127.0.0.1:8080");
    assert.equal(args.b.label, "teacher");
    assert.deepEqual(args.warnings, []);
  } finally {
    if (prevT === undefined) delete process.env.BGWEB_BASE_URL;
    else process.env.BGWEB_BASE_URL = prevT;
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
  const args = parseArgs(["--a-ply", "0", "--b", "teacher", "--b-ply", "1"]);
  assert.equal(args.a.driver, "game-engine");
  assert.equal(args.a.ply, undefined);
  assert.equal(args.b.driver, "teacher");
  assert.equal(args.b.ply, undefined);
  assert.equal(args.warnings.length, 2);
  assert.match(args.warnings[0]!, /a \(game-engine\) does not support ply/);
  assert.match(args.warnings[1]!, /b \(teacher\) does not support ply/);
});

test("CLI --no-cube disables cube", () => {
  const args = parseArgs(["--no-cube"]);
  assert.equal(args.allowCube, false);
});

test("CLI rejects even match length", () => {
  assert.throws(() => parseArgs(["--length", "2"]), /--length/);
});

test("CLI rejects ply outside 0 or 1", () => {
  assert.throws(() => parseArgs(["--a-ply", "2"]), /--a-ply must be 0 or 1/);
});

test("CLI rejects an unknown driver", () => {
  assert.throws(() => parseArgs(["--a", "gnubg"]), /--a/);
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
