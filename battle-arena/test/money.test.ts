import assert from "node:assert/strict";
import { test } from "node:test";
import { generateLegalPlays } from "ts-core";
import { Rng, type MatchPlayer } from "ts-core/sim";
import { playMoneyGame, renderMoneySgf } from "../src/money.ts";
import { batchStamp } from "../src/replay.ts";

function side(offer: "double" | "no-double", take: "take" | "drop"): MatchPlayer {
  return {
    async chooseChecker(pos) {
      return { steps: generateLegalPlays(pos)[0] ?? [] };
    },
    async chooseOffer() {
      return offer;
    },
    async chooseTake() {
      return take;
    },
  };
}

test("a money game asks the cube (no match needed) and scores cube x result for side A", async () => {
  const doubler = side("double", "drop");
  const played = await playMoneyGame({
    rng: new Rng(4),
    sessionId: "s",
    gameIndex: 0,
    aSeat: "p2",
    players: { p1: doubler, p2: doubler },
    labels: { p1: "b-side", p2: "a-side" },
    running: { p1: 0, p2: 0 },
    allowCube: true,
  });
  // The first cube question is answered with a drop: a single game at cube 1.
  assert.equal(played.points, 1);
  assert.equal(played.row.aPoints, played.winnerSeat === "p2" ? 1 : -1);
  assert.ok(played.game.events.some((e) => e.kind === "cube" && e.action === "drop"));
  const sgf = renderMoneySgf([played.game]);
  assert.match(sgf, /MI\[length:0\]\[game:0\]\[ws:0\]\[bs:0\]/);
  assert.doesNotMatch(sgf, /RU\[/);
});

test("--no-cube money games never ask the cube", async () => {
  const played = await playMoneyGame({
    rng: new Rng(4),
    sessionId: "s",
    gameIndex: 3,
    aSeat: "p1",
    players: { p1: side("double", "drop"), p2: side("double", "drop") },
    labels: { p1: "a", p2: "b" },
    running: { p1: 5, p2: 2 },
    allowCube: false,
  });
  assert.ok(!played.game.events.some((e) => e.kind === "cube"));
  assert.ok([1, 2, 3].includes(played.points));
  assert.match(renderMoneySgf([played.game]), /MI\[length:0\]\[game:3\]\[ws:5\]\[bs:2\]/);
});

test("money batches are named as such", () => {
  assert.match(batchStamp(new Date("2026-11-14T10:00:00Z"), "game-engine", "gnubg-ply2", true).batchId, /-game-engine-vs-gnubg-ply2-money$/);
});
