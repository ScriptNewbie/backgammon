import assert from "node:assert/strict";
import { test } from "node:test";
import { formatSummary, summarize, winnerSide } from "../src/summary.ts";

test("winnerSide follows side A's seat", () => {
  assert.equal(winnerSide("p1", "p1"), "a");
  assert.equal(winnerSide("p1", "p2"), "b");
  assert.equal(winnerSide("p2", "p1"), "b");
  assert.equal(winnerSide("p2", "p2"), "a");
});

test("summarize counts wins by the seat the winner sat", () => {
  const summary = summarize(
    [
      {
        winner: "a",
        aSeat: "p1",
        games: 3,
        points: { a: 7, b: 2 },
      },
      {
        winner: "b",
        aSeat: "p2",
        games: 4,
        points: { a: 3, b: 7 },
      },
    ],
    { length: 7, seed: 1, sides: { a: "game-engine", b: "teacher" } },
  );
  assert.equal(summary.wins.a, 1);
  assert.equal(summary.wins.b, 1);
  assert.equal(summary.games, 7);
  assert.equal(summary.winsAsP1.a, 1);
  assert.equal(summary.winsAsP1.b, 1);
  assert.equal(summary.winsAsP2.a, 0);
  assert.equal(summary.winsAsP2.b, 0);
  assert.equal(summary.points.a, 10);
  assert.equal(summary.points.b, 9);
  const text = formatSummary(summary);
  assert.match(text, /a game-engine vs b teacher/);
  assert.match(text, /a: 1 wins \(as p1: 1, as p2: 0\)/);
  assert.match(text, /b: 1 wins \(as p1: 1, as p2: 0\)/);
  assert.match(text, /games: 7/);
  assert.match(text, /cube: on/);
});

test("summary keeps two copies of the same driver apart", () => {
  const summary = summarize(
    [
      {
        winner: "a",
        aSeat: "p2",
        games: 2,
        points: { a: 7, b: 0 },
      },
    ],
    { length: 7, seed: 1, sides: { a: "hedgehog-ply1", b: "hedgehog-ply2" } },
  );
  assert.equal(summary.winsAsP2.a, 1);
  const text = formatSummary(summary);
  assert.match(text, /a hedgehog-ply1 vs b hedgehog-ply2/);
  assert.match(text, /a: 1 wins \(as p1: 0, as p2: 1\)/);
  assert.match(text, /b: 0 wins/);
});
