import assert from "node:assert/strict";
import { test } from "node:test";
import {
  convertPlay,
  flipCubeless,
  mergePlays,
  toBgwebBoard,
  toRequest,
} from "../src/bgweb.ts";
import { openingPosition } from "../src/board.ts";

test("opening board is each side's own 1–24", () => {
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  const board = toBgwebBoard(pos);
  assert.deepEqual(board.x, { "6": 5, "8": 3, "13": 5, "24": 2 });
  assert.deepEqual(board.o, { "6": 5, "8": 3, "13": 5, "24": 2 });
});

test("p2 play points flip 25-k; bar and off stay", () => {
  const steps = convertPlay("p2", [
    { from: "8", to: "5" },
    { from: "6", to: "5" },
    { from: "bar", to: "24" },
    { from: "1", to: "off" },
  ]);
  assert.deepEqual(steps, [
    { from: 17, to: 20 },
    { from: 19, to: 20 },
    { from: "bar", to: 1 },
    { from: 24, to: "off" },
  ]);
});

test("p1 play points are already our ids", () => {
  const steps = convertPlay("p1", [
    { from: "8", to: "5" },
    { from: "6", to: "5" },
  ]);
  assert.deepEqual(steps, [
    { from: 8, to: 5 },
    { from: 6, to: 5 },
  ]);
});

test("mover eval flips to result STM", () => {
  const cubeless = flipCubeless(0.159, {
    win: 0.551,
    winG: 0.174,
    winBG: 0.013,
    lose: 0.449,
    loseG: 0.124,
    loseBG: 0.005,
  });
  assert.equal(cubeless.equity, -0.159);
  assert.equal(cubeless.win, 0.449);
  assert.equal(cubeless.gammon, 0.124);
  assert.equal(cubeless.backgammon, 0.005);
  assert.equal(cubeless.loseGammon, 0.174);
  assert.equal(cubeless.loseBackgammon, 0.013);
});

test("getmoves request omits match and max-moves", () => {
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  pos.dice = [3, 1];
  const req = toRequest(pos, false);
  assert.equal(req.player, "x");
  assert.equal(req.cubeful, false);
  assert.equal(req["score-moves"], true);
  assert.deepEqual(req.dice, [3, 1]);
  assert.equal("max-moves" in req, false);
  assert.equal("match" in req, false);
});

test("mergePlays attaches cubeful equity and keeps cubeAction null", () => {
  const { plays, plies } = mergePlays(
    "p1",
    [
      {
        play: [
          { from: "8", to: "5" },
          { from: "6", to: "5" },
        ],
        evaluation: {
          eq: 0.159,
          diff: 0,
          info: { cubeful: false, plies: 1 },
          probability: {
            win: 0.551,
            winG: 0.174,
            winBG: 0.013,
            lose: 0.449,
            loseG: 0.124,
            loseBG: 0.005,
          },
        },
      },
    ],
    [
      {
        play: [
          { from: "8", to: "5" },
          { from: "6", to: "5" },
        ],
        evaluation: {
          eq: 0.2,
          diff: 0,
          info: { cubeful: true, plies: 1 },
          probability: {
            win: 0.551,
            winG: 0.174,
            winBG: 0.013,
            lose: 0.449,
            loseG: 0.124,
            loseBG: 0.005,
          },
        },
      },
    ],
  );
  assert.equal(plies, 1);
  assert.equal(plays[0]!.eval.cubeless.equity, -0.159);
  assert.equal(plays[0]!.eval.cubefulEquity, -0.2);
  assert.equal(plays[0]!.eval.cubeAction, null);
  assert.equal(plays[0]!.eval.source, "bgweb-api");
  assert.equal(plays[0]!.teacherDiff, 0);
});
