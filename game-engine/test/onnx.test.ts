import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { openingPosition } from "ts-core";
import { evaluatePosition } from "../src/evaluate.ts";
import { loadOnnx } from "../src/infer.ts";

const modelPath = process.env.MODEL_PATH ?? "/models/cubeless.onnx";

const hasModel = existsSync(modelPath);

test("ONNX smoke: opening 31 infers cubeless probs in [0,1]", { skip: !hasModel }, async () => {
  const infer = await loadOnnx(modelPath);
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  pos.onRoll = "p1";
  pos.dice = [3, 1];
  const { moves } = await evaluatePosition(pos, infer);
  assert.ok(moves.length >= 8);
  const c = moves[0]!.eval.cubeless;
  for (const v of [c.win, c.gammon, c.backgammon, c.loseGammon, c.loseBackgammon]) {
    assert.ok(v >= 0 && v <= 1);
  }
  assert.equal(moves[0]!.eval.source, "model");
});
