import assert from "node:assert/strict";
import { test } from "node:test";
import { applySteps, applyTake, openingPosition } from "ts-core";
import { actionNotice, dimFlags } from "../src/render.ts";
import { buildFrames } from "../src/replay.ts";
import { decodePoint, parseCheckerMove, parseMatchSgf } from "../src/sgf.ts";

test("opening 31 8/5 6/5 encodes as 31hefe", () => {
  assert.deepEqual(parseCheckerMove("31hefe"), {
    dice: [3, 1],
    steps: [
      { from: 8, to: 5 },
      { from: 6, to: 5 },
    ],
  });
});

test("bar and off are y and z", () => {
  assert.equal(decodePoint("y"), "bar");
  assert.equal(decodePoint("z"), "off");
  assert.deepEqual(parseCheckerMove("61yr"), { dice: [6, 1], steps: [{ from: "bar", to: 18 }] });
  assert.deepEqual(parseCheckerMove("21az"), { dice: [2, 1], steps: [{ from: 1, to: "off" }] });
});

test("empty play is dice with no steps", () => {
  assert.deepEqual(parseCheckerMove("66"), { dice: [6, 6], steps: [] });
});

test("apply 31hefe from opening", () => {
  const start = openingPosition(1, { p1: 0, p2: 0 }, "crawford");
  start.onRoll = "p1";
  const next = applySteps(start, [
    { from: 8, to: 5 },
    { from: 6, to: 5 },
  ]);
  assert.equal(next.points[4], 2);
  assert.equal(next.points[5], 4);
  assert.equal(next.points[7], 2);
});

test("applyTake doubles cube and gives it to the taker", () => {
  const start = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  const taken = applyTake(start, "p1");
  assert.equal(taken.cube.value, 2);
  assert.equal(taken.cube.owner, "p2");
  assert.deepEqual(taken.cube.mayDouble, { p1: false, p2: true });
});

test("take at 32 yields 64 and kills recube rights", () => {
  const start = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  start.cube.value = 32;
  start.cube.owner = "p1";
  start.cube.mayDouble = { p1: true, p2: false };
  const taken = applyTake(start, "p1");
  assert.equal(taken.cube.value, 64);
  assert.equal(taken.cube.owner, "p2");
  assert.deepEqual(taken.cube.mayDouble, { p1: false, p2: false });
});

const SAMPLE = `(;FF[4]GM[6]CA[UTF-8]AP[move-dumper:1]
MI[length:7][game:0][ws:0][bs:0]
PW[p1-genius]PB[p2-midwit]
RU[Crawford]
RE[W+1]
;W[31hefe]
;B[double]
;W[take]
;B[64lrqu]
;B[66]
)

(;FF[4]GM[6]CA[UTF-8]AP[move-dumper:1]
MI[length:7][game:1][ws:1][bs:0]
PW[p1-genius]PB[p2-midwit]
RU[Crawford]
RE[B+1]
;B[64lrqu]
)
`;

test("parse match trees, cube, empty play, and multi-game", () => {
  const games = parseMatchSgf(SAMPLE);
  assert.equal(games.length, 2);
  assert.equal(games[0]!.p1, "genius");
  assert.equal(games[0]!.p2, "midwit");
  assert.equal(games[0]!.phase, "pre");
  assert.equal(games[0]!.events.length, 5);
  assert.deepEqual(games[0]!.events[0], {
    kind: "move",
    player: "p1",
    dice: [3, 1],
    steps: [
      { from: 8, to: 5 },
      { from: 6, to: 5 },
    ],
  });
  assert.deepEqual(games[0]!.events[1], { kind: "cube", player: "p2", action: "double" });
  assert.deepEqual(games[0]!.events[2], { kind: "cube", player: "p1", action: "take" });
  assert.deepEqual(games[0]!.events[4], { kind: "move", player: "p2", dice: [6, 6], steps: [] });
  assert.equal(games[1]!.gameIndex, 1);
  assert.equal(games[1]!.ws, 1);
  assert.equal(games[1]!.events[0]!.kind, "move");
});

test("frames include a roll before each checker step", () => {
  const frames = buildFrames(parseMatchSgf(SAMPLE));
  assert.equal(frames[0]!.caption, "Opening");
  assert.equal(frames[0]!.position.points[7], 3);
  assert.equal(frames[1]!.caption, "p1 rolls 3-1");
  assert.equal(frames[1]!.lastEvent?.kind, "roll");
  assert.equal(frames[1]!.position.dice?.[0], 3);
  assert.equal(frames[1]!.position.points[7], 3);
  assert.equal(frames[2]!.caption, "p1 31: 8/5");
  assert.deepEqual(frames[2]!.usedDice, [3]);
  assert.equal(frames[2]!.position.points[4], 1);
  assert.equal(frames[2]!.position.points[7], 2);
  assert.equal(frames[3]!.caption, "p1 31: 6/5");
  assert.deepEqual(frames[3]!.usedDice, [3, 1]);
  assert.equal(frames[3]!.position.points[4], 2);
  assert.equal(frames[3]!.position.points[5], 4);
  assert.equal(frames[4]!.caption, "p2 offered");
  assert.equal(frames[4]!.position.cube.value, 1);
  assert.equal(frames[5]!.caption, "p1 accepted");
  assert.equal(frames[5]!.position.cube.value, 2);
  assert.equal(frames[5]!.position.cube.owner, "p1");
  assert.equal(frames[6]!.caption, "p2 rolls 6-4");
  assert.equal(frames[7]!.caption, "p2 64: 12/18");
  assert.equal(frames[7]!.position.onRoll, "p2");
  assert.equal(frames[8]!.caption, "p2 64: 17/21");
  assert.equal(frames[9]!.caption, "p2 rolls 6-6");
  assert.equal(frames[9]!.lastEvent?.kind, "roll");
  if (frames[9]!.lastEvent?.kind === "roll") assert.equal(frames[9]!.lastEvent.canMove, false);
  assert.equal(actionNotice(frames[9]!), "p2 rolled 6-6 and cannot move");
  assert.equal(actionNotice(frames[4]!), "p2 offered");
  assert.equal(actionNotice(frames[5]!), "p1 accepted");
  const game2 = frames.find((f) => f.caption.includes("Game 1 opening"));
  assert.ok(game2);
  assert.equal(game2!.position.match.score.p1, 1);
  assert.equal(game2!.position.cube.value, 1);
});

test("cube drop ends the game and leaves the cube at 1", () => {
  const sgf = `(;FF[4]GM[6]CA[UTF-8]AP[move-dumper:1]
MI[length:7][game:0][ws:0][bs:0]
PW[p1-genius]PB[p2-midwit]
RU[Crawford]
RE[B+1]
;W[31hefe]
;B[double]
;W[drop]
;W[31hefe]
)
`;
  const frames = buildFrames(parseMatchSgf(sgf));
  assert.equal(frames.at(-1)?.caption, "p1 dropped");
  assert.equal(actionNotice(frames.at(-1)!), "p1 dropped");
  assert.equal(frames.at(-1)?.position.cube.value, 1);
  assert.equal(frames.length, 6);
});

test("each shown double die covers two of the four uses", () => {
  assert.deepEqual(dimFlags([6, 6], []), ["none", "none"]);
  assert.deepEqual(dimFlags([6, 6], [6]), ["half", "none"]);
  assert.deepEqual(dimFlags([6, 6], [6, 6]), ["used", "none"]);
  assert.deepEqual(dimFlags([6, 6], [6, 6, 6]), ["used", "half"]);
  assert.deepEqual(dimFlags([6, 6], [6, 6, 6, 6]), ["used", "used"]);
  assert.deepEqual(dimFlags([3, 1], [3]), ["used", "none"]);
  assert.deepEqual(dimFlags([3, 1], [3, 1]), ["used", "used"]);
});

test("fixture stub is a single empty game", () => {
  const sgf = `(;FF[4]GM[6]CA[UTF-8]AP[move-dumper:fixture]
MI[length:1][game:0][ws:0][bs:0]
PW[p1-infallible]PB[p2-infallible]
RE[0]
)
`;
  const games = parseMatchSgf(sgf);
  assert.equal(games[0]!.phase, "crawford");
  assert.equal(games[0]!.result, null);
  assert.equal(games[0]!.events.length, 0);
  assert.equal(buildFrames(games).length, 1);
});
