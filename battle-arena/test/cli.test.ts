import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgs, playersForSeats, seatsForMatch } from "../src/cli.ts";
import type { MatchPlayer } from "ts-core/sim";

test("CLI defaults", () => {
  const prevT = process.env.BGWEB_BASE_URL;
  const prevE = process.env.ENGINE_BASE_URL;
  delete process.env.BGWEB_BASE_URL;
  delete process.env.ENGINE_BASE_URL;
  try {
    const args = parseArgs([]);
    assert.equal(args.matches, 1);
    assert.equal(args.seed, 1);
    assert.equal(args.length, 7);
    assert.equal(args.teacherUrl, "http://127.0.0.1:8080");
    assert.equal(args.engineUrl, "http://127.0.0.1:3000");
  } finally {
    if (prevT === undefined) delete process.env.BGWEB_BASE_URL;
    else process.env.BGWEB_BASE_URL = prevT;
    if (prevE === undefined) delete process.env.ENGINE_BASE_URL;
    else process.env.ENGINE_BASE_URL = prevE;
  }
});

test("CLI rejects even match length", () => {
  assert.throws(() => parseArgs(["--length", "2"]), /--length/);
});

test("seats alternate", () => {
  assert.deepEqual(seatsForMatch(0).engineSeat, "p1");
  assert.deepEqual(seatsForMatch(0).labels, { p1: "game-engine", p2: "teacher" });
  assert.deepEqual(seatsForMatch(1).engineSeat, "p2");
  assert.deepEqual(seatsForMatch(1).labels, { p1: "teacher", p2: "game-engine" });
});

test("playersForSeats swaps drivers", () => {
  const engine = { name: "e" } as unknown as MatchPlayer;
  const teacher = { name: "t" } as unknown as MatchPlayer;
  assert.equal(playersForSeats("p1", engine, teacher).p1, engine);
  assert.equal(playersForSeats("p2", engine, teacher).p1, teacher);
});
