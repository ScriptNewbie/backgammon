import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applySteps,
  clonePosition,
  generateLegalSequences,
  openingPosition,
  positionFromXgid,
  positionToXgid,
  stepsKey,
  type Player,
  type Position,
  type Step,
} from "ts-core";
import { diffMotion, type Flight } from "../src/diff.ts";

function opening(): Position {
  return openingPosition(5, { p1: 0, p2: 0 }, "pre");
}

function flightOf(player: Player, from: Flight["from"], to: Flight["to"]): Flight {
  return { player, from, to };
}

test("first paint and an identical XGID do not move", () => {
  const pos = opening();
  assert.deepEqual(diffMotion(null, pos), { roll: false, cube: false, flights: [] });
  const xgid = positionToXgid(pos);
  const again = positionFromXgid(xgid);
  assert.deepEqual(diffMotion(positionFromXgid(xgid), again), { roll: false, cube: false, flights: [] });
});

test("a new roll spins and a swap of the same faces does not", () => {
  const quiet = opening();
  const rolled = clonePosition(quiet);
  rolled.dice = [3, 1];
  assert.equal(diffMotion(quiet, rolled).roll, true);
  assert.deepEqual(diffMotion(quiet, rolled).flights, []);
  const swapped = clonePosition(rolled);
  swapped.dice = [1, 3];
  assert.equal(diffMotion(rolled, swapped).roll, false);
  const other = clonePosition(rolled);
  other.dice = [6, 5];
  assert.equal(diffMotion(rolled, other).roll, true);
});

test("clearing the dice does not spin", () => {
  const rolled = opening();
  rolled.dice = [4, 2];
  const done = clonePosition(rolled);
  done.dice = null;
  assert.equal(diffMotion(rolled, done).roll, false);
});

test("a cube value or owner change pulses", () => {
  const start = opening();
  const taken = clonePosition(start);
  taken.cube = { value: 2, owner: "p2", mayDouble: { p1: false, p2: true } };
  const motion = diffMotion(start, taken);
  assert.equal(motion.cube, true);
  assert.equal(motion.roll, false);
  assert.deepEqual(motion.flights, []);
});

test("one checker step, a hit, an entry, and a bear-off pair by direction", () => {
  const step = opening();
  step.dice = [3, 1];
  const moved = applySteps(step, [{ from: 24, to: 23 }]);
  assert.deepEqual(diffMotion(step, moved).flights, [flightOf("p1", 24, 23)]);

  const hit = opening();
  hit.points = Array(24).fill(0);
  hit.points[4] = -1;
  hit.points[5] = 1;
  hit.points[7] = 14;
  hit.points[11] = -14;
  hit.dice = [1, 2];
  const afterHit = applySteps(hit, [{ from: 6, to: 5 }]);
  assert.deepEqual(diffMotion(hit, afterHit).flights, [flightOf("p1", 6, 5)]);
  const hitPlay = generateLegalSequences(hit).find((seq) => seq.steps.some((step) => step.from === 6 && step.to === 5));
  const played = diffMotion(hit, applySteps(hit, hitPlay!.steps)).flights;
  assert.equal(played.some((flight) => flight.to === "bar"), false);
  assert.ok(played.some((flight) => flight.player === "p1" && flight.from === 6 && flight.to === 5));

  const enter = opening();
  enter.points = Array(24).fill(0);
  enter.points[5] = 14;
  enter.points[12] = -15;
  enter.bar = { p1: 1, p2: 0 };
  enter.dice = [1, 2];
  const entered = applySteps(enter, [{ from: "bar", to: 24 }]);
  assert.deepEqual(diffMotion(enter, entered).flights, [flightOf("p1", "bar", 24)]);

  const bear = opening();
  bear.points = Array(24).fill(0);
  bear.points[0] = 15;
  bear.points[23] = -15;
  bear.dice = [1, 2];
  const borne = applySteps(bear, [{ from: 1, to: "off" }]);
  assert.deepEqual(diffMotion(bear, borne).flights, [flightOf("p1", 1, "off")]);
});

test("a full legal play flies that step order", () => {
  const start = opening();
  start.dice = [3, 1];
  const seqs = generateLegalSequences(start);
  let best = seqs[0]!;
  for (const seq of seqs) {
    if (stepsKey(seq.steps) < stepsKey(best.steps)) best = seq;
  }
  const next = applySteps(start, best.steps);
  const motion = diffMotion(start, next);
  assert.equal(motion.roll, false);
  assert.deepEqual(
    motion.flights,
    best.steps.map((step: Step) => flightOf("p1", step.from, step.to)),
  );
});
