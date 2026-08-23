import assert from "node:assert/strict";
import { test } from "node:test";
import { openingMoneyPosition, openingPosition } from "ts-core";
import { createApp } from "../src/app.ts";
import { evaluatePosition, type Infer } from "../src/evaluate.ts";

const even: Infer = {
  async infer(features) {
    return features.map(() => new Float32Array([0.55, 0.1, 0, 0.05, 0]));
  }
};

function opening31() {
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  pos.onRoll = "p1";
  pos.dice = [3, 1];
  return pos;
}

test("GET /health", async () => {
  const app = createApp(even);
  const res = await app.request("/health");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test("POST /evaluate opening 31 returns ranked legal plays", async () => {
  const app = createApp(even);
  const res = await app.request("/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(opening31()),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { moves: { steps: unknown[]; eval: { source: string; cubefulEquity: number; cubeless: { win: number } } }[] };
  assert.ok(body.moves.length >= 8);
  assert.equal(body.moves[0]!.eval.source, "model");
  for (let i = 1; i < body.moves.length; i++) {
    assert.ok(body.moves[i - 1]!.eval.cubefulEquity <= body.moves[i]!.eval.cubefulEquity);
  }
});

test("POST /evaluate 400 without dice", async () => {
  const app = createApp(even);
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  const res = await app.request("/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(pos),
  });
  assert.equal(res.status, 400);
});

test("evaluatePosition ranks by negated cubeful equity", async () => {
  let n = 0;
  const varying: Infer = {
    async infer(features) {
      return features.map(() => {
        n += 1;
        const win = 0.4 + (n % 5) * 0.05;
        return new Float32Array([win, 0, 0, 0, 0]);
      });
    },
  };
  const { moves } = await evaluatePosition(opening31(), varying);
  for (let i = 1; i < moves.length; i++) {
    assert.ok(moves[i - 1]!.eval.cubefulEquity <= moves[i]!.eval.cubefulEquity);
  }
  assert.equal(moves[0]!.eval.source, "model");
});

test("POST /evaluate with match null returns cubeAction null", async () => {
  const app = createApp(even);
  const pos = openingMoneyPosition();
  pos.onRoll = "p1";
  pos.dice = [3, 1];
  const res = await app.request("/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(pos),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { moves: { eval: { cubeAction: unknown } }[] };
  assert.ok(body.moves.length > 0);
  for (const m of body.moves) {
    assert.equal(m.eval.cubeAction, null);
  }
});
