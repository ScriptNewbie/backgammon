import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { applySteps, openingPosition } from "../src/board.ts";
import { generateLegalPlays } from "../src/moves.ts";
import type { Position } from "../src/types.ts";
import {
  matchXgPlay,
  parseXgCheckerText,
  parseXgCubeText,
  positionToXgid,
  xgResultCubeless,
} from "../src/xg.ts";

const FIXTURES = new URL("./fixtures/xg/", import.meta.url);

function fixture(name: string): string {
  return readFileSync(new URL(name, FIXTURES), "utf8");
}

/** Test-only reader for the XGIDs XG exported. Production code only writes XGID. */
function positionFromXgid(xgid: string): Position {
  const [board, cube, owner, turn, dice, s1, s2, crawford, length, maxCube] = xgid
    .replace(/^XGID=/, "")
    .split(":");
  const count = (ch: string): number =>
    ch === "-" ? 0 : ch >= "a" ? ch.charCodeAt(0) - 96 : -(ch.charCodeAt(0) - 64);
  const points: number[] = [];
  for (let i = 1; i <= 24; i++) points.push(-count(board![i]!));
  const bar = { p1: -count(board![25]!), p2: count(board![0]!) };
  const on = (sign: 1 | -1) =>
    points.reduce((sum, v) => sum + (Math.sign(v) === sign ? Math.abs(v) : 0), 0);
  const value = 2 ** Number(cube);
  const dead = Number(maxCube) === Number(cube) && Number(crawford) === 0;
  const live = Number(crawford) === 0 && !dead;
  const ownerName = owner === "1" ? "p1" : owner === "-1" ? "p2" : "centered";
  return {
    points,
    bar,
    off: { p1: 15 - on(1) - bar.p1, p2: 15 - on(-1) - bar.p2 },
    onRoll: turn === "1" ? "p1" : "p2",
    dice: dice === "00" ? null : [Number(dice![0]), Number(dice![1])],
    cube: {
      value,
      owner: ownerName,
      mayDouble: {
        p1: live && ownerName !== "p2",
        p2: live && ownerName !== "p1",
      },
    },
    match: { length: Number(length), score: { p1: Number(s1), p2: Number(s2) }, crawford: crawford === "1" },
  };
}

const checkerFixtures = readdirSync(FIXTURES).filter((f) => f.startsWith("checker-"));
const cubeFixtures = readdirSync(FIXTURES).filter((f) => f.startsWith("cube-"));

test("opening 3-1 is XG's own export", () => {
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  pos.dice = [3, 1];
  assert.equal(positionToXgid(pos), "XGID=-b----E-C---eE---c-e----B-:0:0:1:31:0:0:0:7:6");
});

test("p2 on roll, owned cube, score, and Crawford match XG's exports", () => {
  const pos = openingPosition(7, { p1: 3, p2: 2 }, "pre");
  pos.onRoll = "p2";
  pos.dice = [6, 1];
  pos.cube = { value: 2, owner: "p1", mayDouble: { p1: true, p2: false } };
  assert.equal(positionToXgid(pos), "XGID=-b----E-C---eE---c-e----B-:1:1:-1:61:3:2:0:7:6");

  const crawford = openingPosition(7, { p1: 6, p2: 2 }, "crawford");
  assert.equal(positionToXgid(crawford), "XGID=-b----E-C---eE---c-e----B-:0:0:1:00:6:2:1:7:6");

  const owned = openingPosition(7, { p1: 1, p2: 4 }, "pre");
  owned.onRoll = "p2";
  owned.cube = { value: 4, owner: "p2", mayDouble: { p1: false, p2: true } };
  assert.equal(positionToXgid(owned), "XGID=-b----E-C---eE---c-e----B-:2:-1:-1:00:1:4:0:7:6");
});

test("a cube nobody may turn is capped at its value", () => {
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  pos.dice = [3, 1];
  pos.cube.mayDouble = { p1: false, p2: false };
  assert.equal(positionToXgid(pos), "XGID=-b----E-C---eE---c-e----B-:0:0:1:31:0:0:0:7:0");
});

test("every fixture XGID round-trips through our encoder", () => {
  for (const name of [...checkerFixtures, ...cubeFixtures]) {
    const xgid = parseXgCheckerOrCubeXgid(fixture(name));
    assert.equal(positionToXgid(positionFromXgid(xgid)), xgid, name);
  }
});

function parseXgCheckerOrCubeXgid(text: string): string {
  return text.split("\n")[0]!.trim();
}

test("every analysed XG play is one of our legal plays", () => {
  for (const name of checkerFixtures) {
    const analysis = parseXgCheckerText(fixture(name));
    const pos = positionFromXgid(analysis.xgid);
    for (const line of analysis.moves) {
      const steps = matchXgPlay(pos, line.notation);
      if (line.notation === "Cannot Move") assert.deepEqual(steps, [], name);
      else assert.ok(steps.length > 0, `${name} ${line.notation}`);
    }
  }
});

test("hit, doubles, bear-off, and dance land where XG says", () => {
  const hit = parseXgCheckerText(fixture("checker-p1-hit.txt"));
  const hitPos = positionFromXgid(hit.xgid);
  assert.equal(hit.moves[0]!.notation, "8/5 6/5");
  assert.equal(hit.moves[2]!.notation, "24/23 6/3*");
  const afterHit = applySteps(hitPos, matchXgPlay(hitPos, "24/23 6/3*"));
  assert.equal(afterHit.bar.p2, 1);
  assert.equal(afterHit.points[2], 1);

  const doubles = parseXgCheckerText(fixture("checker-p1-66.txt"));
  assert.equal(doubles.moves[0]!.notation, "24/18(2) 13/7(2)");
  const dPos = positionFromXgid(doubles.xgid);
  const afterD = applySteps(dPos, matchXgPlay(dPos, doubles.moves[0]!.notation));
  assert.equal(afterD.points[17], 2);
  assert.equal(afterD.points[6], 2);
  assert.equal(afterD.points[23], 0);

  const bear = parseXgCheckerText(fixture("checker-p1-bearoff.txt"));
  const bPos = positionFromXgid(bear.xgid);
  assert.equal(bear.moves[0]!.notation, "6/Off 1/Off");
  assert.equal(applySteps(bPos, matchXgPlay(bPos, "6/Off 1/Off")).off.p1, 2);

  const dance = parseXgCheckerText(fixture("checker-p1-dance.txt"));
  assert.equal(dance.moves.length, 1);
  assert.equal(dance.moves[0]!.notation, "Cannot Move");
  assert.deepEqual(matchXgPlay(positionFromXgid(dance.xgid), "Cannot Move"), []);
});

test("p2 notation is mover-relative", () => {
  const hit = parseXgCheckerText(fixture("checker-p2-hit.txt"));
  const pos = positionFromXgid(hit.xgid);
  assert.equal(pos.onRoll, "p2");
  const steps = matchXgPlay(pos, "24/23 6/3*");
  assert.deepEqual(new Set(steps.map((s) => `${s.from}/${s.to}`)), new Set(["1/2", "19/22"]));
  assert.equal(applySteps(pos, steps).bar.p1, 1);

  const bar = parseXgCheckerText(fixture("checker-p2-bar.txt"));
  const barPos = positionFromXgid(bar.xgid);
  assert.equal(bar.moves[0]!.notation, "Bar/21 24/21");
  const after = applySteps(barPos, matchXgPlay(barPos, "Bar/21 24/21"));
  assert.equal(after.bar.p2, 0);
  assert.equal(after.points[3], -2);
});

test("best-play probabilities flip to the player about to move", () => {
  const best = parseXgCheckerText(fixture("checker-p1-hit.txt")).moves[0]!;
  assert.equal(best.level, "3-ply");
  assert.equal(best.equity, 0.136);
  const c = xgResultCubeless(best);
  assert.ok(Math.abs(c.win - 0.4666) < 1e-9);
  assert.ok(Math.abs(c.gammon - 0.1148) < 1e-9);
  assert.ok(Math.abs(c.backgammon - 0.0049) < 1e-9);
  assert.ok(Math.abs(c.loseGammon - 0.1444) < 1e-9);
  assert.ok(Math.abs(c.loseBackgammon - 0.0052) < 1e-9);
});

test("decimal points parse the same as decimal commas", () => {
  const comma = parseXgCheckerText(fixture("checker-p1-hit.txt"));
  const dot = parseXgCheckerText(fixture("checker-p1-hit.txt").replace(/(\d),(\d)/g, "$1.$2"));
  assert.deepEqual(dot, comma);
});

test("cube actions map to offer and take", () => {
  const expected: Record<string, [string, string]> = {
    "cube-no-double.txt": ["no-double", "take"],
    "cube-double-take.txt": ["double", "take"],
    "cube-double-pass.txt": ["double", "drop"],
    "cube-too-good.txt": ["no-double", "drop"],
    "cube-redouble-pass.txt": ["double", "drop"],
  };
  assert.deepEqual(cubeFixtures.sort(), Object.keys(expected).sort());
  for (const [name, [offer, take]] of Object.entries(expected)) {
    const cube = parseXgCubeText(fixture(name));
    assert.equal(cube.offer, offer, name);
    assert.equal(cube.take, take, name);
  }
});

test("unrecognised XG text fails instead of guessing", () => {
  const cube = fixture("cube-no-double.txt");
  assert.throws(() => parseXgCubeText(cube.replace("No double / Take", "No double / Beaver")), /not recognised/);
  // \r?\n: fixtures are CRLF on a Windows checkout (core.autocrlf), and `.` does not match \r.
  assert.throws(() => parseXgCubeText(cube.replace(/Best Cube action:.*\r?\n/, "")), /no Best Cube action/);
  const checker = fixture("checker-p1-hit.txt");
  assert.throws(() => parseXgCheckerText(checker.replace("8/5 6/5", "eight to five")), /not recognised/);
  assert.throws(() => parseXgCheckerText(checker.replace(/^XGID=.*\r?\n/, "")), /no XGID/);
  assert.throws(() => parseXgCheckerText(checker.replace(/Player: {3}53,34%/, "Player:   x")), /Player \/ Opponent/);

  const pos = positionFromXgid(parseXgCheckerText(checker).xgid);
  assert.ok(generateLegalPlays(pos).length > 0);
  assert.throws(() => matchXgPlay(pos, "13/7"), /not one of our legal plays/);
  assert.throws(() => matchXgPlay(pos, "Cannot Move"), /Cannot Move/);
  assert.throws(() => matchXgPlay(pos, "20/17 6/5"), /does not apply/);
});
