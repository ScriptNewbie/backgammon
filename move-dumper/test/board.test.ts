import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OPENING_POINTS,
  applySteps,
  applyTake,
  assertFifteen,
  checkerCount,
  clonePosition,
  gameResult,
  initialPhase,
  nextPhase,
  openingPosition,
} from "../src/board.ts";
import type { Position } from "../src/types.ts";

function opening(onRoll: "p1" | "p2" = "p1"): Position {
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  pos.onRoll = onRoll;
  pos.dice = [3, 1];
  return pos;
}

test("opening has 15 checkers per side", () => {
  const pos = opening();
  assert.equal(pos.points.length, 24);
  assert.deepEqual(pos.points, [...OPENING_POINTS]);
  assertFifteen(pos);
  assert.equal(checkerCount(pos, "p1"), 15);
  assert.equal(checkerCount(pos, "p2"), 15);
});

test("length-1 opening is Crawford with a dead cube", () => {
  const pos = openingPosition(1, { p1: 0, p2: 0 }, initialPhase(1));
  assert.equal(pos.match.crawford, true);
  assert.equal(pos.cube.mayDouble.p1, false);
  assert.equal(pos.cube.mayDouble.p2, false);
  assert.equal(pos.cube.value, 1);
  assert.equal(pos.cube.owner, "centered");
});

test("p1 opening 31 8/5 6/5", () => {
  const next = applySteps(opening("p1"), [
    { from: 8, to: 5 },
    { from: 6, to: 5 },
  ]);
  assert.equal(next.points[7], 2);
  assert.equal(next.points[5], 4);
  assert.equal(next.points[4], 2);
  assertFifteen(next);
});

test("p2 opening 31 17/20 19/20", () => {
  const next = applySteps(opening("p2"), [
    { from: 17, to: 20 },
    { from: 19, to: 20 },
  ]);
  assert.equal(next.points[16], -2);
  assert.equal(next.points[18], -4);
  assert.equal(next.points[19], -2);
  assertFifteen(next);
});

test("hit sends a blot to the bar", () => {
  const pos = opening("p1");
  pos.points[10] = -1;
  pos.points[11] = -4;
  const next = applySteps(pos, [{ from: 13, to: 11 }]);
  assert.equal(next.points[10], 1);
  assert.equal(next.bar.p2, 1);
  assertFifteen(next);
});

test("p1 enters from the bar", () => {
  const pos = opening("p1");
  pos.points[23] = 1;
  pos.bar.p1 = 1;
  const next = applySteps(pos, [{ from: "bar", to: 22 }]);
  assert.equal(next.bar.p1, 0);
  assert.equal(next.points[21], 1);
  assertFifteen(next);
});

test("p1 bears off", () => {
  const pos = opening("p1");
  pos.points = Array(24).fill(0);
  pos.points[0] = 2;
  pos.off.p1 = 13;
  pos.points[18] = -5;
  pos.points[16] = -3;
  pos.points[11] = -5;
  pos.off.p2 = 2;
  const next = applySteps(pos, [{ from: 1, to: "off" }]);
  assert.equal(next.off.p1, 14);
  assert.equal(next.points[0], 1);
  assertFifteen(next);
});

test("clonePosition is a deep copy", () => {
  const pos = opening();
  const copy = clonePosition(pos);
  copy.points[0] = 99;
  copy.bar.p1 = 3;
  assert.equal(pos.points[0], -2);
  assert.equal(pos.bar.p1, 0);
});

test("gammon when loser has 0 off and is not in the winner home", () => {
  const pos = opening();
  pos.points = Array(24).fill(0);
  pos.off.p1 = 15;
  pos.points[11] = -5;
  pos.points[12] = -5;
  pos.points[16] = -5;
  const result = gameResult(pos);
  assert.equal(result?.kind, "gammon");
  assert.equal(result?.winner, "p1");
  assert.equal(result?.multiplier, 2);
});

test("backgammon when loser is on the bar", () => {
  const pos = opening();
  pos.points = Array(24).fill(0);
  pos.off.p1 = 15;
  pos.bar.p2 = 1;
  pos.points[11] = -5;
  pos.points[16] = -5;
  pos.points[18] = -4;
  const result = gameResult(pos);
  assert.equal(result?.kind, "backgammon");
  assert.equal(result?.multiplier, 3);
});

test("backgammon when loser is in the winner home", () => {
  const pos = opening();
  pos.points = Array(24).fill(0);
  pos.off.p2 = 15;
  pos.points[23] = 2;
  pos.points[12] = 5;
  pos.points[7] = 3;
  pos.points[5] = 5;
  const result = gameResult(pos);
  assert.equal(result?.winner, "p2");
  assert.equal(result?.kind, "backgammon");
});

test("single when loser has borne off", () => {
  const pos = opening();
  pos.points = Array(24).fill(0);
  pos.off.p1 = 15;
  pos.off.p2 = 2;
  pos.points[11] = -5;
  pos.points[16] = -5;
  pos.points[18] = -3;
  const result = gameResult(pos);
  assert.equal(result?.kind, "single");
});

test("Crawford after first reaching length-1", () => {
  assert.equal(nextPhase("pre", { p1: 4, p2: 1 }, 5), "crawford");
  assert.equal(nextPhase("crawford", { p1: 4, p2: 2 }, 5), "post");
  assert.equal(nextPhase("post", { p1: 4, p2: 3 }, 5), "post");
});

test("gammon that wins the match skips Crawford", () => {
  assert.equal(nextPhase("pre", { p1: 5, p2: 0 }, 5), "pre");
});

test("applyTake gives the cube to the taker", () => {
  const pos = opening("p1");
  const next = applyTake(pos, "p1");
  assert.equal(next.cube.value, 2);
  assert.equal(next.cube.owner, "p2");
  assert.equal(next.cube.mayDouble.p1, false);
  assert.equal(next.cube.mayDouble.p2, true);
});

test("cube stops at 64 and nobody may recube", () => {
  let pos = opening("p1");
  let doubler: "p1" | "p2" = "p1";
  for (const value of [2, 4, 8, 16, 32, 64]) {
    pos = applyTake(pos, doubler);
    assert.equal(pos.cube.value, value);
    doubler = doubler === "p1" ? "p2" : "p1";
  }
  assert.equal(pos.cube.value, 64);
  assert.equal(pos.cube.owner, "p1");
  assert.deepEqual(pos.cube.mayDouble, { p1: false, p2: false });
  const stuck = applyTake(pos, "p1");
  assert.equal(stuck.cube.value, 64);
  assert.deepEqual(stuck.cube.mayDouble, { p1: false, p2: false });
});
