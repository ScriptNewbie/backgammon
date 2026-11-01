import assert from "node:assert/strict";
import { test } from "node:test";
import { generateLegalSequences, openingPosition, type Position } from "ts-core";
import { chooseStep, findMove, movableFrom, remainingDice, reviewMove, turnComplete, type EngineMove } from "../src/play/rules.ts";

function opening(dice: [number, number]): Position {
  const pos = openingPosition(5, { p1: 0, p2: 0 }, "pre");
  pos.dice = dice;
  return pos;
}

test("click uses the first die in display order that is legal", () => {
  const pos = opening([3, 1]);
  const seqs = generateLegalSequences(pos);
  assert.deepEqual(chooseStep(seqs, [], 8, [3, 1]), { step: { from: 8, to: 5 }, die: 3 });
  assert.deepEqual(chooseStep(seqs, [], 8, [1, 3]), { step: { from: 8, to: 7 }, die: 1 });
});

test("falls through to the second die when the first is blocked", () => {
  const pos = opening([6, 5]);
  const seqs = generateLegalSequences(pos);
  // 24 → 18 is open, 24 → 19 is p2's 5-stack (blocked): with order [5, 6] the click still plays the 6.
  assert.deepEqual(chooseStep(seqs, [], 24, [5, 6]), { step: { from: 24, to: 18 }, die: 6 });
});

test("played dice are consumed and the turn completes", () => {
  const pos = opening([3, 1]);
  const seqs = generateLegalSequences(pos);
  const first = chooseStep(seqs, [], 8, [3, 1])!;
  assert.deepEqual(remainingDice([3, 1], [first]), [1]);
  assert.equal(turnComplete(seqs, [first]), false);
  const second = chooseStep(seqs, [first], 6, [3, 1])!;
  assert.deepEqual(second, { step: { from: 6, to: 5 }, die: 1 });
  assert.equal(turnComplete(seqs, [first, second]), true);
  assert.equal(movableFrom(seqs, [first, second]).size, 0);
});

test("doubles allow four clicks of the same die", () => {
  const pos = opening([6, 6]);
  const seqs = generateLegalSequences(pos);
  assert.deepEqual(remainingDice([6, 6], []), [6, 6, 6, 6]);
  const a = chooseStep(seqs, [], 24, [6, 6])!;
  const b = chooseStep(seqs, [a], 24, [6, 6])!;
  const c = chooseStep(seqs, [a, b], 13, [6, 6])!;
  const d = chooseStep(seqs, [a, b, c], 13, [6, 6])!;
  assert.ok(a && b && c && d);
  assert.equal(turnComplete(seqs, [a, b, c, d]), true);
});

test("review matches the play by resulting board and reports equity loss", () => {
  const pos = opening([3, 1]);
  const ev = (eq: number) => ({
    cubeless: { equity: eq, win: 0.5, gammon: 0, backgammon: 0, loseGammon: 0, loseBackgammon: 0 },
    cubefulEquity: eq,
    cubeAction: null,
    source: "model" as const,
  });
  const moves: EngineMove[] = [
    { steps: [{ from: 8, to: 5 }, { from: 6, to: 5 }], eval: ev(-0.2) },
    { steps: [{ from: 13, to: 10 }, { from: 24, to: 23 }], eval: ev(-0.05) },
  ];
  const mine = [{ from: 24, to: 23 }, { from: 13, to: 10 }] as const;
  assert.ok(findMove(moves, pos, [...mine]));
  const r = reviewMove(moves, pos, [...mine])!;
  assert.equal(r.yours, "24/23 13/10");
  assert.equal(r.best, "8/5 6/5");
  assert.ok(Math.abs(r.loss - 0.15) < 1e-9);
});
