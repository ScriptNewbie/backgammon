import assert from "node:assert/strict";
import { test } from "node:test";
import { openingPosition } from "ts-core";
import { pickBestPlay } from "../src/rank.ts";
import type { Eval } from "ts-core";

function evalAt(equity: number): Eval {
  return {
    cubeless: {
      equity,
      win: 0.5 + equity / 2,
      gammon: 0,
      backgammon: 0,
      loseGammon: 0,
      loseBackgammon: 0,
    },
    cubefulEquity: equity,
    cubeAction: null,
    source: "model",
  };
}

test("pickBestPlay prefers higher mover MWC (lower result equity)", () => {
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  pos.dice = [3, 1];
  const best = pickBestPlay(
    [
      { steps: [{ from: 8, to: 5 }], eval: evalAt(0.2) },
      { steps: [{ from: 6, to: 5 }], eval: evalAt(-0.1) },
    ],
    pos,
    "pre",
  );
  assert.ok(best);
  assert.deepEqual(best.steps, [{ from: 6, to: 5 }]);
});

test("pickBestPlay returns null on empty list", () => {
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  assert.equal(pickBestPlay([], pos, "pre"), null);
});
