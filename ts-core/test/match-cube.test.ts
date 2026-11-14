import assert from "node:assert/strict";
import { test } from "node:test";
import { openingPosition } from "../src/board.ts";
import { makeCubeless } from "../src/eval.ts";
import { matchCubeful, matchCubeVerdict } from "../src/match-cube.ts";
import { deadCubeMwc } from "../src/mwc.ts";
import type { Position } from "../src/types.ts";

const probs = (win: number, gammon = 0, loseGammon = 0) =>
  makeCubeless({ win, gammon, backgammon: 0, loseGammon, loseBackgammon: 0 });

function at(length: number, p1: number, p2: number, phase: "pre" | "post" | "crawford" = "pre"): Position {
  const pos = openingPosition(length, { p1, p2 }, phase);
  pos.match = { length, score: { p1, p2 }, crawford: phase === "crawford" };
  pos.onRoll = "p1";
  pos.dice = null;
  return pos;
}

test("x = 0 and a dead cube give the dead-cube MWC", () => {
  const pos = at(7, 2, 3);
  const c = probs(0.62, 0.18, 0.09);
  const dead = deadCubeMwc(c, pos, 1, "p1", "pre");
  assert.ok(Math.abs(matchCubeful(c, pos, "p1", "centered", 1, 0) - dead) < 1e-12);
  assert.ok(Math.abs(matchCubeful(c, pos, "p1", "dead", 1) - dead) < 1e-12);
});

test("live MWC runs from the dead values at p = 0 and p = 1 and grows with p", () => {
  const pos = at(9, 1, 4);
  let prev = -1;
  for (let i = 0; i <= 20; i++) {
    const p = i / 20;
    const v = matchCubeful(probs(p), pos, "p1", "centered", 1, 1);
    assert.ok(v >= prev - 1e-12, `not increasing at p=${p}`);
    prev = v;
  }
  assert.ok(Math.abs(matchCubeful(probs(0), pos, "p1", "centered", 1, 1) - deadCubeMwc(probs(0), pos, 1, "p1", "pre")) < 1e-12);
  assert.ok(Math.abs(matchCubeful(probs(1), pos, "p1", "centered", 1, 1) - deadCubeMwc(probs(1), pos, 1, "p1", "pre")) < 1e-12);
});

test("long match at 0-0 behaves like money: no double, double/take, double/drop", () => {
  const pos = at(15, 0, 0);
  assert.equal(matchCubeVerdict(probs(0.55), pos, "centered").offer, "no-double");
  const dt = matchCubeVerdict(probs(0.72), pos, "centered");
  assert.deepEqual([dt.offer, dt.take], ["double", "take"]);
  const dp = matchCubeVerdict(probs(0.85), pos, "centered");
  assert.deepEqual([dp.offer, dp.take], ["double", "drop"]);
});

test("post-Crawford: the trailer doubles at once and the leader takes", () => {
  // 5-point match, p1 at 3 (2-away) trails p2 at 4 (1-away). The leader's redouble is worthless.
  const pos = at(5, 3, 4, "post");
  pos.cube.mayDouble = { p1: true, p2: true };
  // At 40% the trailer still doubles (winning the game wins the match), and the leader takes:
  // taking leaves 60% to win the match, dropping only 50% (1-away vs 1-away).
  const v = matchCubeVerdict(probs(0.4), pos, "centered");
  assert.equal(v.offer, "double");
  assert.equal(v.take, "take");
});

test("owning the cube is worth more than a centered cube, which is worth more than theirs", () => {
  const pos = at(7, 0, 0);
  const c = probs(0.6, 0.15, 0.08);
  const mine = matchCubeful(c, pos, "p1", "mine", 1);
  const centered = matchCubeful(c, pos, "p1", "centered", 1);
  const theirs = matchCubeful(c, pos, "p1", "theirs", 1);
  assert.ok(mine > centered && centered > theirs, `${mine} ${centered} ${theirs}`);
});
