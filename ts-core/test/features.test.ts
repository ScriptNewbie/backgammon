import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { FEATURE_SIZE, featurize } from "../src/features.ts";
import type { Position } from "../src/types.ts";

const fixturePath = fileURLToPath(
  new URL("../../training-ground/fixtures/features.json", import.meta.url),
);

type Case = { id: string; position: Position; vector: number[] };

const cases = JSON.parse(readFileSync(fixturePath, "utf8")) as Case[];

test("golden feature vectors match Python fixtures", () => {
  assert.ok(cases.length >= 2);
  for (const c of cases) {
    const got = featurize(c.position);
    assert.equal(got.length, FEATURE_SIZE, c.id);
    assert.equal(c.vector.length, FEATURE_SIZE, c.id);
    for (let i = 0; i < FEATURE_SIZE; i++) {
      const diff = Math.abs(got[i]! - c.vector[i]!);
      assert.ok(diff < 1e-6, `${c.id} index ${i}: ${got[i]} vs ${c.vector[i]}`);
    }
  }
});
