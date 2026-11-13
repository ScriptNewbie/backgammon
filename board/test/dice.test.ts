import assert from "node:assert/strict";
import { test } from "node:test";
import { dimFlags } from "../src/dice.ts";

test("each shown double die covers two of the four uses", () => {
  assert.deepEqual(dimFlags([6, 6], []), ["none", "none"]);
  assert.deepEqual(dimFlags([6, 6], [6]), ["half", "none"]);
  assert.deepEqual(dimFlags([6, 6], [6, 6]), ["used", "none"]);
  assert.deepEqual(dimFlags([6, 6], [6, 6, 6]), ["used", "half"]);
  assert.deepEqual(dimFlags([6, 6], [6, 6, 6, 6]), ["used", "used"]);
  assert.deepEqual(dimFlags([3, 1], [3]), ["used", "none"]);
  assert.deepEqual(dimFlags([3, 1], [3, 1]), ["used", "used"]);
});
