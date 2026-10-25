import assert from "node:assert/strict";
import { test } from "node:test";
import { applySteps, openingMoneyPosition, openingPosition, stepsKey } from "../src/board.ts";
import {
  checkerKey,
  checkerKeyFromOgid,
  joinHedgehogMoves,
  positionToOgid,
} from "../src/hedgehog.ts";
import { generateLegalPlays } from "../src/moves.ts";

test("opening with p1 on roll is the black-to-move OGID", () => {
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  pos.dice = [3, 1];
  assert.equal(
    positionToOgid(pos),
    "11ccccchhhjjjjj:66666888dddddoo:N0N:31:W:R:0:0:7:0",
  );
  assert.equal(checkerKeyFromOgid(positionToOgid(pos)), checkerKey(pos));
});

test("p2 on roll is white to move, and a dead cube is D", () => {
  const pos = openingMoneyPosition();
  pos.onRoll = "p2";
  pos.dice = [6, 1];
  pos.cube.mayDouble = { p1: false, p2: false };
  assert.equal(
    positionToOgid(pos),
    "11ccccchhhjjjjj:66666888dddddoo:D0N:61:B:R:0:0:0:0",
  );
});

test("Crawford score is white then black, with a C match length", () => {
  const pos = openingPosition(7, { p1: 1, p2: 2 }, "crawford");
  assert.equal(
    positionToOgid(pos),
    "11ccccchhhjjjjj:66666888dddddoo:D0N::W:C:2:1:7C:0",
  );
});

test("borne-off checkers are omitted and still round-trip", () => {
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  pos.points[23] = 1;
  pos.off.p1 = 1;
  const ogid = positionToOgid(pos);
  assert.equal(ogid.split(":")[1], "66666888dddddo");
  assert.equal(checkerKeyFromOgid(ogid), checkerKey(pos));
});

test("a forced pass is the same board returned once", () => {
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  pos.onRoll = "p2";
  pos.dice = [2, 1];
  pos.points = Array.from({ length: 24 }, () => 0);
  for (let point = 0; point < 6; point++) pos.points[point] = 2;
  pos.points[12] = 3;
  pos.points[11] = -14;
  pos.bar = { p1: 0, p2: 1 };
  assert.equal(generateLegalPlays(pos).length, 0);
  assert.equal(
    positionToOgid(pos).split(":").slice(0, 2).join(":"),
    "0cccccccccccccc:112233445566ddd",
  );
  const passed = joinHedgehogMoves(pos, [
    {
      ogid: "0cccccccccccccc:112233445566ddd:N0N::W:IW:0:0:0:0",
      win: 0.03,
      gammon_win: 0,
      bg_win: 0,
      gammon_loss: 0.9,
      bg_loss: 0,
      equity: -1.8,
    },
  ]);
  assert.equal(passed.unmatched, 0);
  assert.deepEqual(passed.plays, []);
  const other = joinHedgehogMoves(pos, [
    {
      ogid: "11ccccchhhjjjjj:66666888dddddoo:N0N::W:IW:0:0:0:0",
      win: 0.5,
      gammon_win: 0,
      bg_win: 0,
      gammon_loss: 0,
      bg_loss: 0,
    },
  ]);
  assert.equal(other.unmatched, 1);
});

test("successor OGIDs join back to our steps and flip to result STM", () => {
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  pos.dice = [3, 1];
  const legal = generateLegalPlays(pos);
  assert.ok(legal.length > 1);
  const moves = legal.map((steps) => ({
    ogid: positionToOgid(applySteps(pos, steps)),
    win: 0.6,
    gammon_win: 0.2,
    bg_win: 0.05,
    gammon_loss: 0.1,
    bg_loss: 0.01,
    equity: 0.2,
  }));
  const { plays, unmatched } = joinHedgehogMoves(pos, moves);
  assert.equal(unmatched, 0);
  assert.deepEqual(plays.map((p) => stepsKey(p.steps)).sort(), legal.map(stepsKey).sort());
  const eval0 = plays[0]!.eval;
  assert.equal(eval0.source, "hedgehog");
  assert.equal(eval0.cubeAction, null);
  assert.equal(eval0.cubefulEquity, 0);
  assert.equal(eval0.cubeless.equity, -0.2);
  assert.equal(eval0.cubeless.win, 0.4);
  assert.equal(eval0.cubeless.gammon, 0.1);
  assert.equal(eval0.cubeless.backgammon, 0.01);
  assert.equal(eval0.cubeless.loseGammon, 0.2);
  assert.equal(eval0.cubeless.loseBackgammon, 0.05);
});
