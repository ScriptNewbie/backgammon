import assert from "node:assert/strict";
import { test } from "node:test";
import { openingPosition } from "../src/board.ts";
import { generateLegalPlays } from "../src/moves.ts";
import type { Cubeless, Position } from "../src/types.ts";
import {
  infallibleCube,
  pickBestPlayIndex,
  playGame,
  playMatch,
  rollOpening,
  Rng,
  type MatchObserver,
  type MatchPlayer,
} from "../src/sim.ts";

const half: Cubeless = {
  equity: 0,
  win: 0.5,
  gammon: 0,
  backgammon: 0,
  loseGammon: 0,
  loseBackgammon: 0,
};

function dropper(): MatchPlayer {
  return {
    async chooseChecker(pos) {
      const plays = generateLegalPlays(pos);
      return { steps: plays[0] ?? [], cubeless: half };
    },
    async chooseOffer() {
      return "double";
    },
    async chooseTake() {
      return "drop";
    },
  };
}

test("opening dice are never doubles; higher player is on roll", () => {
  const rng = new Rng(7);
  for (let i = 0; i < 50; i++) {
    const roll = rollOpening(rng);
    assert.notEqual(roll.dice[0], roll.dice[1]);
    assert.ok(roll.dice[0] > roll.dice[1]);
  }
});

test("opening ply skips the cube", async () => {
  const kinds: string[] = [];
  const observer: MatchObserver = {
    onChecker() {
      kinds.push("checker");
    },
    onCube() {
      kinds.push("cube");
    },
  };
  const player = dropper();
  const rng = new Rng(1);
  await playGame({
    rng,
    players: { p1: player, p2: player },
    matchId: "m",
    length: 3,
    score: { p1: 0, p2: 0 },
    phase: "pre",
    gameIndex: 0,
    observer,
  });
  assert.equal(kinds[0], "checker");
  assert.ok(kinds.includes("cube"));
});

test("allowCube false never offers the cube", async () => {
  const kinds: string[] = [];
  const observer: MatchObserver = {
    onChecker() {
      kinds.push("checker");
    },
    onCube() {
      kinds.push("cube");
    },
  };
  const player = dropper();
  const game = await playGame({
    rng: new Rng(1),
    players: { p1: player, p2: player },
    matchId: "m",
    length: 3,
    score: { p1: 0, p2: 0 },
    phase: "pre",
    gameIndex: 0,
    observer,
    allowCube: false,
  });
  assert.ok(kinds.includes("checker"));
  assert.equal(kinds.includes("cube"), false);
  assert.ok(!game.events.some((e) => e.kind === "cube"));
  assert.equal(game.cubeValue, 1);
});

test("cube drop ends the game as a single", async () => {
  const player = dropper();
  const game = await playGame({
    rng: new Rng(1),
    players: { p1: player, p2: player },
    matchId: "m",
    length: 3,
    score: { p1: 0, p2: 0 },
    phase: "pre",
    gameIndex: 0,
  });
  assert.equal(game.result.multiplier, 1);
  assert.equal(game.cubeValue, 1);
  assert.ok(game.events.some((e) => e.kind === "cube" && e.action === "drop"));
});

test("playMatch ends when a side reaches length", async () => {
  const player = dropper();
  const result = await playMatch({
    rng: new Rng(1),
    length: 3,
    players: { p1: player, p2: player },
    labels: { p1: "a", p2: "b" },
  });
  assert.ok(result.score.p1 >= 3 || result.score.p2 >= 3);
  assert.ok(result.games.length >= 3);
  assert.ok(result.winner === "p1" || result.winner === "p2");
});

test("bear-off from a one-checker board ends the game", async () => {
  const pos: Position = openingPosition(3, { p1: 0, p2: 0 }, "pre");
  pos.points = Array.from({ length: 24 }, () => 0);
  pos.points[0] = 1;
  pos.points[23] = -15;
  pos.off = { p1: 14, p2: 0 };
  pos.onRoll = "p1";
  pos.dice = [1, 2];
  const player: MatchPlayer = {
    ...infallibleCube(),
    async chooseChecker() {
      return { steps: [{ from: 1, to: "off" }], cubeless: half };
    },
  };
  const game = await playGame({
    rng: new Rng(1),
    players: { p1: player, p2: player },
    matchId: "m",
    length: 3,
    score: { p1: 0, p2: 0 },
    phase: "pre",
    gameIndex: 0,
    start: { position: pos, stmCubeless: null, opening: true },
  });
  assert.equal(game.result.winner, "p1");
  assert.equal(game.result.multiplier, 2);
});

test("pickBestPlayIndex uses rankScore then teacherDiff then stepsKey", () => {
  assert.equal(
    pickBestPlayIndex([
      { rankScore: 0.4, teacherDiff: 1, stepsKey: "a" },
      { rankScore: 0.5, teacherDiff: 0, stepsKey: "b" },
    ]),
    1,
  );
  assert.equal(
    pickBestPlayIndex([
      { rankScore: 0.5, teacherDiff: 0, stepsKey: "b" },
      { rankScore: 0.5, teacherDiff: 1, stepsKey: "a" },
    ]),
    1,
  );
  assert.equal(
    pickBestPlayIndex([
      { rankScore: 0.5, teacherDiff: 0, stepsKey: "b" },
      { rankScore: 0.5, teacherDiff: 0, stepsKey: "a" },
    ]),
    1,
  );
});
