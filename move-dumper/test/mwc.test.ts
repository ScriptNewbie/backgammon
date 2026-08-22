import assert from "node:assert/strict";
import { test } from "node:test";
import { PAIRING_WEIGHTS, sampleCheckerIndex, sampleLevelPair } from "../src/levels.ts";
import { Rng } from "../src/rng.ts";

test("default pairing never samples noob-noob", () => {
  assert.equal(PAIRING_WEIGHTS["noob-noob"], 0);
  const rng = new Rng(42);
  for (let i = 0; i < 400; i++) {
    const pair = sampleLevelPair(rng);
    assert.equal(pair.p1 === "noob" && pair.p2 === "noob", false);
  }
});

test("infallible picks higher MWC then teacher diff then steps", () => {
  const rng = new Rng(1);
  const plays = [
    { moverMwc: 0.5, teacherDiff: 0, stepsKey: "13/10 24/23" },
    { moverMwc: 0.51, teacherDiff: -0.01, stepsKey: "8/5 6/5" },
    { moverMwc: 0.51, teacherDiff: 0, stepsKey: "8/4 6/5" },
  ];
  assert.equal(sampleCheckerIndex("infallible", plays, rng), 2);
  assert.equal(sampleCheckerIndex("noob", [plays[0]!], rng), 0);
});
