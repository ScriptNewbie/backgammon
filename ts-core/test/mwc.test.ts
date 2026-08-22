import assert from "node:assert/strict";
import { test } from "node:test";
import { openingPosition } from "../src/board.ts";
import { evaluateCube, wrapModelEval } from "../src/cube.ts";
import { matchEquity } from "../src/met.ts";
import { deadCubeMwc, moverMwc } from "../src/mwc.ts";
import type { Cubeless } from "../src/types.ts";

const even: Cubeless = {
  equity: 0,
  win: 0.5,
  gammon: 0,
  backgammon: 0,
  loseGammon: 0,
  loseBackgammon: 0,
};

test("Kazaross 1-away vs 1-away is 0.5", () => {
  assert.equal(matchEquity(1, 1, "pre"), 0.5);
  assert.equal(matchEquity(1, 1, "crawford"), 0.5);
  assert.equal(matchEquity(1, 1, "post"), 0.5);
});

test("away <= 0 is already decided", () => {
  assert.equal(matchEquity(0, 3, "pre"), 1);
  assert.equal(matchEquity(3, 0, "pre"), 0);
  assert.equal(matchEquity(-2, 4, "post"), 1);
});

test("post-Crawford uses leader/trailer tables", () => {
  assert.equal(matchEquity(1, 2, "post"), 0.51197);
  assert.equal(matchEquity(2, 1, "post"), 0.48803);
});

test("certain win at 1-away is MWC 1", () => {
  const pos = openingPosition(1, { p1: 0, p2: 0 }, "crawford");
  const sure: Cubeless = { ...even, win: 1, equity: 1 };
  assert.equal(deadCubeMwc(sure, pos, 1, "p1", "crawford"), 1);
});

test("mover MWC is 1 minus opponent result MWC", () => {
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  pos.onRoll = "p1";
  const mwc = moverMwc(even, pos, "pre");
  assert.ok(mwc > 0.45 && mwc < 0.55);
});

test("cube too-good and drop follow the spec inequalities", () => {
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  pos.onRoll = "p1";
  const eval_ = evaluateCube(even, pos, "pre");
  assert.equal(eval_.wouldDrop, eval_.takerTake < eval_.takerDrop);
  assert.equal(eval_.tooGood, eval_.noDouble > eval_.doubleTake);
  if (eval_.tooGood) assert.equal(eval_.infallibleOffer, "no-double");
  else {
    const offer = eval_.wouldDrop ? eval_.doubleDrop : eval_.doubleTake;
    assert.equal(eval_.infallibleOffer, offer > eval_.noDouble ? "double" : "no-double");
  }
  assert.equal(eval_.infallibleTake, eval_.wouldDrop ? "drop" : "take");
});

test("cube at 64 cannot be offered", () => {
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  pos.onRoll = "p1";
  pos.cube.value = 64;
  pos.cube.owner = "p1";
  pos.cube.mayDouble = { p1: false, p2: false };
  const eval_ = evaluateCube(even, pos, "pre");
  assert.equal(eval_.infallibleOffer, "no-double");
  assert.equal(eval_.doubleTake, eval_.noDouble);
  const wrapped = wrapModelEval(even, pos);
  assert.equal(wrapped.cubeAction, null);
  assert.equal(wrapped.cubefulEquity, 0);
});

test("infallible takes a drop when take MWC is worse", () => {
  const pos = openingPosition(7, { p1: 6, p2: 0 }, "pre");
  pos.onRoll = "p2";
  const crushing: Cubeless = {
    equity: -0.9,
    win: 0.05,
    gammon: 0.01,
    backgammon: 0,
    loseGammon: 0.4,
    loseBackgammon: 0.1,
  };
  const eval_ = evaluateCube(crushing, pos, "pre");
  assert.equal(eval_.infallibleTake, eval_.takerTake < eval_.takerDrop ? "drop" : "take");
});

test("cubefulEquity is cubeless equity times cube value", () => {
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  pos.cube.value = 4;
  const strong: Cubeless = {
    equity: 0.5,
    win: 0.7,
    gammon: 0.1,
    backgammon: 0,
    loseGammon: 0,
    loseBackgammon: 0,
  };
  const wrapped = wrapModelEval(strong, pos);
  assert.equal(wrapped.cubefulEquity, 2);
  assert.equal(wrapped.source, "model");
  assert.ok(wrapped.cubeAction === null || typeof wrapped.cubeAction.double === "boolean");
});
