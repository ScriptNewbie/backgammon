import assert from "node:assert/strict";
import { test } from "node:test";
import { makeCubeless } from "ts-core";
import { consistentCubeless, consistentPlays } from "../src/labels.ts";

test("consistent probabilities pass through unchanged", () => {
  const c = makeCubeless({ win: 0.55, gammon: 0.17, backgammon: 0.01, loseGammon: 0.12, loseBackgammon: 0.005 });
  assert.deepEqual(consistentCubeless(c), c);
});

test("rounding that breaks an outcome bound is clamped to it", () => {
  // gnubg prints each probability rounded on its own: all wins are gammons, and a gammon
  // loss rounds 1e-6 above the loss chance.
  const c = consistentCubeless(
    makeCubeless({ win: 0.700001, gammon: 0.700002, backgammon: 0.000001, loseGammon: 0.3, loseBackgammon: 0.300001 }),
  );
  assert.equal(c.gammon, 0.700001);
  assert.equal(c.loseGammon, 1 - 0.700001);
  assert.equal(c.loseBackgammon, c.loseGammon);
  assert.equal(c.backgammon, 0.000001);
  const outcomes = [c.win - c.gammon, c.gammon - c.backgammon, c.backgammon, 1 - c.win - c.loseGammon, c.loseGammon - c.loseBackgammon, c.loseBackgammon];
  assert.ok(outcomes.every((p) => p >= 0));
  assert.equal(c.equity, makeCubeless(c).equity);
});

test("probabilities outside [0, 1] are clamped", () => {
  const c = consistentCubeless(makeCubeless({ win: 1.000001, gammon: -0, backgammon: 0, loseGammon: 0.000001, loseBackgammon: 0 }));
  assert.equal(c.win, 1);
  assert.equal(c.loseGammon, 0);
});

test("consistentPlays clamps every play and keeps the rest of the eval", () => {
  const cubeless = makeCubeless({ win: 0.4, gammon: 0.5, backgammon: 0, loseGammon: 0, loseBackgammon: 0 });
  const [play] = consistentPlays([
    { steps: [{ from: 8, to: 5 }], teacherDiff: 0, eval: { cubeless, cubefulEquity: 0, cubeAction: null, source: "gnubg" } },
  ]);
  assert.equal(play!.eval.cubeless.gammon, 0.4);
  assert.equal(play!.eval.source, "gnubg");
  assert.deepEqual(play!.steps, [{ from: 8, to: 5 }]);
});
