import assert from "node:assert/strict";
import { test } from "node:test";
import { openingMoneyPosition, openingPosition } from "../src/board.ts";
import { cubeDecision, wrapModelEval } from "../src/cube.ts";
import { makeCubeless } from "../src/eval.ts";
import { cubeView, moneyCubeful, moneyCubeVerdict } from "../src/money.ts";

// Gammonless race: W = L = 1, so TP = 0.5/2.5 = 0.2 and CP = 2/2.5 = 0.8.
const race = (win: number) => makeCubeless({ win, gammon: 0, backgammon: 0, loseGammon: 0, loseBackgammon: 0 });

test("fully live cube (x = 1) is piecewise linear between the take and cash points", () => {
  assert.ok(Math.abs(moneyCubeful(race(0.2), "centered", 1, 1) - -1) < 1e-12);
  assert.ok(Math.abs(moneyCubeful(race(0.8), "centered", 1, 1) - 1) < 1e-12);
  assert.ok(Math.abs(moneyCubeful(race(0.5), "centered", 1, 1) - 0) < 1e-12);
  // Owning the cube: no cash against you; 0 at p = 0.4 (from -1 at 0 to +1 at 0.8).
  assert.ok(Math.abs(moneyCubeful(race(0.4), "mine", 1, 1) - 0) < 1e-12);
  // Opponent's cube: -1 at 0.2, +1 at 1.
  assert.ok(Math.abs(moneyCubeful(race(0.6), "theirs", 1, 1) - 0) < 1e-12);
});

test("x blends dead and live equity; a dead cube is equity times value", () => {
  const c = race(0.65);
  const live = moneyCubeful(c, "centered", 1, 1);
  const dead = moneyCubeful(c, "centered", 1, 0);
  assert.ok(Math.abs(dead - c.equity) < 1e-12);
  assert.ok(Math.abs(moneyCubeful(c, "centered", 2, 0.68) - 2 * (0.32 * dead + 0.68 * live)) < 1e-12);
  assert.equal(moneyCubeful(c, "dead", 4), c.equity * 4);
});

test("money cube decisions: no double early, double/take, double/pass, too good", () => {
  const verdict = (win: number, gammon = 0) =>
    moneyCubeVerdict(makeCubeless({ win, gammon, backgammon: 0, loseGammon: 0, loseBackgammon: 0 }), "centered", 1);
  assert.equal(verdict(0.55).offer, "no-double");
  const dt = verdict(0.72);
  assert.deepEqual([dt.offer, dt.take], ["double", "take"]);
  const dp = verdict(0.85);
  assert.deepEqual([dp.offer, dp.take], ["double", "drop"]);
  // Winning almost always, mostly gammons: playing on beats cashing one point.
  const tooGood = verdict(0.97, 0.8);
  assert.deepEqual([tooGood.offer, tooGood.take], ["no-double", "drop"]);
  assert.ok(tooGood.noDouble > 1);
});

test("cubeView reads mayDouble; money /cube decision is available with the cube live", () => {
  const pos = openingMoneyPosition();
  assert.equal(cubeView(pos, "p1"), "centered");
  pos.cube = { value: 2, owner: "p2", mayDouble: { p1: false, p2: true } };
  assert.equal(cubeView(pos, "p1"), "theirs");
  assert.equal(cubeView(pos, "p2"), "mine");
  pos.onRoll = "p2";
  pos.dice = null;
  const d = cubeDecision(pos, race(0.72));
  assert.equal(d.available, true);
  assert.equal(d.currency, "money");
  const v = moneyCubeVerdict(race(0.72), "mine", 2);
  assert.deepEqual([d.offer, d.take, d.noDouble, d.doubleTake, d.doubleDrop], [v.offer, v.take, v.noDouble, v.doubleTake, v.doubleDrop]);
  pos.onRoll = "p1";
  assert.equal(cubeDecision(pos, race(0.72)).available, false);
  const crawford = openingPosition(7, { p1: 6, p2: 0 }, "crawford");
  assert.equal(cubeDecision(crawford, race(0.72)).currency, "mwc");
});

test("engine evals carry Janowski cubeful equity for the side to move of the result", () => {
  const pos = openingMoneyPosition();
  pos.onRoll = "p2";
  const c = race(0.6);
  assert.equal(wrapModelEval(c, pos).cubefulEquity, moneyCubeful(c, "centered", 1));
});
