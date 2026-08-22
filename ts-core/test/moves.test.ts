import assert from "node:assert/strict";
import { test } from "node:test";
import { openingPosition, stepsKey } from "../src/board.ts";
import { generateLegalPlays } from "../src/moves.ts";
import type { Position, Step } from "../src/types.ts";

function opening(onRoll: "p1" | "p2", dice: [number, number]): Position {
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  pos.onRoll = onRoll;
  pos.dice = dice;
  return pos;
}

function keys(plays: Step[][]): Set<string> {
  return new Set(plays.map((p) => stepsKey(p)));
}

test("opening 31 includes 8/5 6/5 and 13/10 24/23", () => {
  const plays = generateLegalPlays(opening("p1", [3, 1]));
  const k = keys(plays);
  assert.ok(k.has("8/5 6/5") || k.has("6/5 8/5"), [...k].join(" | "));
  assert.ok(
    [...k].some((s) => s.includes("13/10") && s.includes("24/23")),
    [...k].join(" | "),
  );
  assert.ok(plays.length >= 8);
  for (const play of plays) assert.ok(play.length >= 1);
});

test("p2 opening 31 mirrors toward 24", () => {
  const plays = generateLegalPlays(opening("p2", [3, 1]));
  const k = keys(plays);
  assert.ok(k.has("17/20 19/20") || k.has("19/20 17/20"), [...k].join(" | "));
});

test("bar must enter before other moves", () => {
  const pos = opening("p1", [6, 1]);
  pos.points[23] = 1;
  pos.bar.p1 = 1;
  const plays = generateLegalPlays(pos);
  assert.ok(plays.length > 0);
  for (const play of plays) {
    assert.equal(play[0]!.from, "bar");
  }
});

test("dancing returns no plays when both entries are blocked", () => {
  const pos = opening("p1", [6, 5]);
  pos.points = Array(24).fill(0);
  pos.bar.p1 = 1;
  pos.off.p1 = 14;
  pos.points[18] = -2;
  pos.points[19] = -2;
  pos.off.p2 = 11;
  const plays = generateLegalPlays(pos);
  assert.deepEqual(plays, []);
});

test("must use the higher die when only one die can be played", () => {
  const pos = opening("p1", [6, 2]);
  pos.points = Array(24).fill(0);
  pos.points[7] = 1;
  pos.points[12] = 14;
  pos.points[5] = -2;
  pos.points[6] = -2;
  pos.points[10] = -2;
  pos.points[18] = -9;
  const plays = generateLegalPlays(pos);
  assert.equal(plays.length, 1, plays.map((p) => stepsKey(p)).join(" | "));
  assert.deepEqual(plays[0], [{ from: 8, to: 2 }]);
});

test("bear off with exact and overshoot", () => {
  const pos = opening("p1", [6, 1]);
  pos.points = Array(24).fill(0);
  pos.points[5] = 1;
  pos.points[0] = 1;
  pos.off.p1 = 13;
  pos.points[18] = -5;
  pos.points[16] = -5;
  pos.points[12] = -5;
  const plays = generateLegalPlays(pos);
  const k = keys(plays);
  assert.ok([...k].some((s) => s.includes("6/off") && s.includes("1/off")), [...k].join(" | "));
});

test("doubles play four pips", () => {
  const pos = opening("p1", [2, 2]);
  const plays = generateLegalPlays(pos);
  assert.ok(plays.length > 0);
  assert.ok(plays.every((p) => p.length === 4));
});
