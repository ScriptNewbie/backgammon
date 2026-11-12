import assert from "node:assert/strict";
import { test } from "node:test";
import { openingMoneyPosition, openingPosition } from "../src/board.ts";
import { cubeDecision, evaluateCube, wrapModelEval } from "../src/cube.ts";
import { matchEquity } from "../src/met.ts";
import { deadCubeMwc, moverMwc, sortForMover } from "../src/mwc.ts";
import type { Cubeless, Eval, Step } from "../src/types.ts";

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
  assert.equal(wrapped.cubeAction, null);
});

test("wrapModelEval with match null leaves cubeAction null", () => {
  const pos = openingMoneyPosition();
  pos.cube.mayDouble = { p1: true, p2: true };
  const wrapped = wrapModelEval(even, pos);
  assert.equal(wrapped.cubeAction, null);
  assert.equal(wrapped.cubefulEquity, 0);
});

const gammonish: Cubeless = {
  equity: 0.3,
  win: 0.6,
  gammon: 0.3,
  backgammon: 0,
  loseGammon: 0.1,
  loseBackgammon: 0,
};

function move(key: number, cubeless: Cubeless, cubefulEquity = cubeless.equity): { steps: Step[]; eval: Eval } {
  return { steps: [{ from: key, to: key - 1 }], eval: { cubeless, cubefulEquity, cubeAction: null, source: "model" } };
}

test("sortForMover: money orders by negated result cubeful equity, ties by stepsKey", () => {
  const pos = openingMoneyPosition();
  const sorted = sortForMover([move(8, even, 0.1), move(6, even, -0.2), move(13, even, -0.2)], pos);
  assert.deepEqual(sorted.map((m) => m.steps[0]!.from), [13, 6, 8]);
});

test("sortForMover: match play orders by mover MWC, not money equity", () => {
  const pos = openingPosition(5, { p1: 0, p2: 3 }, "pre");
  pos.onRoll = "p1";
  // Result STM is p2 (2-away). Same money equity, different gammon mix, so different MWC.
  const plain: Cubeless = { equity: 0, win: 0.5, gammon: 0, backgammon: 0, loseGammon: 0, loseBackgammon: 0 };
  const swingy: Cubeless = { equity: 0, win: 0.4, gammon: 0.2, backgammon: 0, loseGammon: 0, loseBackgammon: 0 };
  const moves = [move(8, plain), move(6, swingy)];
  const sorted = sortForMover(moves, pos);
  const byMwc = [...moves].sort((a, b) => moverMwc(b.eval.cubeless, pos, "pre") - moverMwc(a.eval.cubeless, pos, "pre"));
  assert.deepEqual(sorted, byMwc);
  assert.notEqual(moverMwc(plain, pos, "pre"), moverMwc(swingy, pos, "pre"));
});

test("cubeDecision is evaluateCube on the doubler's own probs, or unavailable", () => {
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  pos.onRoll = "p1";
  pos.dice = null;
  const ev = evaluateCube(gammonish, pos, "pre");
  assert.deepEqual(cubeDecision(pos, gammonish), {
    available: true,
    offer: ev.infallibleOffer,
    take: ev.infallibleTake,
    noDouble: ev.noDouble,
    doubleTake: ev.doubleTake,
    doubleDrop: ev.doubleDrop,
    cubeless: gammonish,
  });
  const crawford = openingPosition(7, { p1: 6, p2: 0 }, "crawford");
  assert.equal(cubeDecision(crawford, gammonish).available, false);
  assert.equal(cubeDecision(crawford, gammonish).take, null);
  const money = openingMoneyPosition();
  money.cube.mayDouble = { p1: true, p2: true };
  assert.equal(cubeDecision(money, gammonish).available, false);
});
