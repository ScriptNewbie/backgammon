import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMoneySummary, formatSummary, summarize, summarizeMoney, winnerSide } from "../src/summary.ts";

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
    { length: 7, seed: 1, sides: { a: "hedgehog-ply0", b: "hedgehog-ply1" } },
  );
  assert.equal(summary.winsAsP2.a, 1);
  const text = formatSummary(summary);
  assert.match(text, /a hedgehog-ply0 vs b hedgehog-ply1/);
  assert.match(text, /a: 1 wins \(as p1: 0, as p2: 1\)/);
  assert.match(text, /b: 0 wins/);
});

test("money summary: points won per side and side A's points per game with its standard error", () => {
  const s = summarizeMoney(
    [
      { aSeat: "p1", winner: "a", aPoints: 2 },
      { aSeat: "p2", winner: "b", aPoints: -1 },
      { aSeat: "p1", winner: "a", aPoints: 4 },
      { aSeat: "p2", winner: "b", aPoints: -1 },
    ],
    { seed: 3, sides: { a: "game-engine", b: "gnubg-ply2" } },
  );
  assert.deepEqual(s.wins, { a: 2, b: 2 });
  assert.deepEqual(s.points, { a: 6, b: 2 });
  assert.equal(s.ppg, 1);
  // Sample sd of [2,-1,4,-1] is sqrt(6); standard error sqrt(6/4).
  assert.ok(Math.abs(s.stdErr - Math.sqrt(1.5)) < 1e-12);
  const text = formatMoneySummary(s);
  assert.match(text, /money games: 4 {2}seed: 3 {2}cube: on/);
  assert.match(text, /a: 2 wins {2}points won: 6 {2}ppg: \+1\.000 ± 1\.225/);
  assert.match(text, /b: 2 wins {2}points won: 2 {2}ppg: -1\.000 ± 1\.225/);
});
