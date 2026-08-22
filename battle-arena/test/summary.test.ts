import assert from "node:assert/strict";
import { test } from "node:test";
import { engineAtSeat, formatSummary, summarize } from "../src/summary.ts";

test("engineAtSeat maps match winner to engine id", () => {
  assert.equal(engineAtSeat("p1", "p1"), "game-engine");
  assert.equal(engineAtSeat("p1", "p2"), "teacher");
  assert.equal(engineAtSeat("p2", "p1"), "teacher");
  assert.equal(engineAtSeat("p2", "p2"), "game-engine");
});

test("summarize counts wins by seat", () => {
  const summary = summarize(
    [
      {
        winner: "game-engine",
        engineSeat: "p1",
        games: 3,
        points: { "game-engine": 7, teacher: 2 },
      },
      {
        winner: "teacher",
        engineSeat: "p2",
        games: 4,
        points: { "game-engine": 3, teacher: 7 },
      },
    ],
    { length: 7, seed: 1 },
  );
  assert.equal(summary.wins["game-engine"], 1);
  assert.equal(summary.wins.teacher, 1);
  assert.equal(summary.winsAsP1["game-engine"], 1);
  assert.equal(summary.winsAsP2.teacher, 1);
  assert.equal(summary.points["game-engine"], 10);
  assert.equal(summary.points.teacher, 9);
  const text = formatSummary(summary);
  assert.match(text, /engine vs teacher/);
  assert.match(text, /game-engine: 1 wins/);
  assert.match(text, /teacher: 1 wins/);
});
