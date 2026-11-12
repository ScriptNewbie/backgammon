import assert from "node:assert/strict";
import { test } from "node:test";
import { openingMoneyPosition, openingPosition, stepsKey, type CubeDecision } from "ts-core";
import { evaluateCube, moverMwc } from "ts-core/match";
import { createApp } from "../src/app.ts";
import { cubePosition, evaluatePosition, type Infer } from "../src/evaluate.ts";

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

function testApp(infer: Infer = even, logs?: string[]) {
  const log = logs ? (line: string) => logs.push(line) : () => {};
  return createApp(infer, log);
}

test("GET /health", async () => {
  const app = testApp();
  const res = await app.request("/health");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test("POST /evaluate opening 31 returns legal plays, best first by mover MWC", async () => {
  const app = testApp(varying());
  const pos = opening31();
  const res = await app.request("/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(pos),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as Awaited<ReturnType<typeof evaluatePosition>>;
  assert.ok(body.moves.length >= 8);
  assert.equal(body.moves[0]!.eval.source, "model");
  assertMwcOrder(body.moves, pos);
});

test("POST /evaluate 400 without dice", async () => {
  const app = testApp();
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  const res = await app.request("/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(pos),
  });
  assert.equal(res.status, 400);
});

function varying(): Infer {
  let n = 0;
  return {
    async infer(features) {
      return features.map(() => {
        n += 1;
        const win = 0.4 + (n % 5) * 0.05;
        const gammon = (n % 3) * 0.05;
        return new Float32Array([win, gammon, 0, 0.1 - gammon / 2, 0]);
      });
    },
  };
}

function assertMwcOrder(moves: Awaited<ReturnType<typeof evaluatePosition>>["moves"], pos: ReturnType<typeof opening31>) {
  for (let i = 1; i < moves.length; i++) {
    const a = moverMwc(moves[i - 1]!.eval.cubeless, pos, "pre");
    const b = moverMwc(moves[i]!.eval.cubeless, pos, "pre");
    assert.ok(a > b || (a === b && stepsKey(moves[i - 1]!.steps) < stepsKey(moves[i]!.steps)));
  }
}

test("match play: evaluatePosition orders by mover MWC at the score", async () => {
  const pos = opening31();
  pos.match = { length: 5, score: { p1: 3, p2: 0 }, crawford: false };
  const { moves } = await evaluatePosition(pos, varying());
  assertMwcOrder(moves, pos);
  assert.ok(moves.every((m) => m.eval.cubeAction === null));
});

test("money play: evaluatePosition orders by negated cubeful equity", async () => {
  const pos = openingMoneyPosition();
  pos.onRoll = "p1";
  pos.dice = [3, 1];
  const { moves } = await evaluatePosition(pos, varying());
  for (let i = 1; i < moves.length; i++) {
    assert.ok(moves[i - 1]!.eval.cubefulEquity <= moves[i]!.eval.cubefulEquity);
  }
});

test("POST /evaluate with match null returns cubeAction null", async () => {
  const app = testApp();
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

test("logs health and evaluate requests", async () => {
  const logs: string[] = [];
  const app = testApp(even, logs);
  const health = await app.request("/health");
  assert.equal(health.status, 200);
  const ok = await app.request("/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(opening31()),
  });
  assert.equal(ok.status, 200);
  const body = (await ok.json()) as { moves: unknown[] };
  const bad = await app.request("/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(openingPosition(7, { p1: 0, p2: 0 }, "pre")),
  });
  assert.equal(bad.status, 400);
  assert.equal(logs.length, 3);
  assert.match(logs[0]!, /^GET \/health 200 \d+ms$/);
  assert.match(logs[1]!, new RegExp(`^POST /evaluate 200 \\d+ms moves=${body.moves.length} onRoll=p1 dice=3-1$`));
  assert.match(logs[2]!, /^POST \/evaluate 400 \d+ms error=dice must be two ints 1-6$/);
});

test("logs invalid json", async () => {
  const logs: string[] = [];
  const app = testApp(even, logs);
  const res = await app.request("/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.equal(res.status, 400);
  assert.equal(logs.length, 1);
  assert.match(logs[0]!, /^POST \/evaluate 400 \d+ms error=invalid json$/);
});

function preRoll() {
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  pos.onRoll = "p2";
  pos.dice = null;
  return pos;
}

test("POST /cube: the net's own probs for the doubler through the cube formula", async () => {
  const app = testApp();
  const pos = preRoll();
  const res = await app.request("/cube", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(pos),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as CubeDecision;
  // `even` infers [0.55, 0.1, 0, 0.05, 0] for any position: those are the doubler's probs.
  assert.ok(Math.abs(body.cubeless.win - 0.55) < 1e-6);
  const ev = evaluateCube(body.cubeless, pos, "pre");
  assert.equal(body.available, true);
  assert.equal(body.offer, ev.infallibleOffer);
  assert.equal(body.take, ev.infallibleTake);
  assert.equal(body.noDouble, ev.noDouble);
});

test("POST /cube: unavailable in the Crawford game and for money; 400 with dice", async () => {
  const crawford = openingPosition(7, { p1: 6, p2: 0 }, "crawford");
  crawford.dice = null;
  const decided = await cubePosition(crawford, even);
  assert.deepEqual([decided.available, decided.offer, decided.take], [false, "no-double", null]);
  const money = openingMoneyPosition();
  money.dice = null;
  money.cube.mayDouble = { p1: true, p2: true };
  assert.equal((await cubePosition(money, even)).available, false);

  const logs: string[] = [];
  const app = testApp(even, logs);
  const res = await app.request("/cube", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(opening31()),
  });
  assert.equal(res.status, 400);
  assert.match(logs[0]!, /^POST \/cube 400 \d+ms error=dice must be null/);
});
