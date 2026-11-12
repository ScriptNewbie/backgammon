import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";
import { openingPosition, type CubeDecision } from "ts-core";
import { createGameEngineDriver } from "../src/drivers/game-engine.ts";

const ctx = { matchId: "m", gameId: "g", ply: 3, phase: "pre" as const };
const requests: string[] = [];
let decision: CubeDecision;
let server: Server;
let baseUrl = "";

const probs = (win: number) => ({ equity: 0, win, gammon: 0, backgammon: 0, loseGammon: 0, loseBackgammon: 0 });

before(async () => {
  server = createServer((req, res) => {
    requests.push(req.url ?? "");
    res.setHeader("content-type", "application/json");
    req.resume();
    req.on("end", () => {
      if (req.url?.startsWith("/cube")) {
        res.end(JSON.stringify(decision));
        return;
      }
      // The engine's first move has the HIGHEST opponent win chance: an arena that re-ranked
      // by its own numbers would not pick it.
      res.end(
        JSON.stringify({
          moves: [
            { steps: [{ from: 8, to: 5 }, { from: 6, to: 5 }], eval: { cubeless: probs(0.6), cubefulEquity: 0, cubeAction: null, source: "model" } },
            { steps: [{ from: 13, to: 10 }, { from: 24, to: 23 }], eval: { cubeless: probs(0.3), cubefulEquity: 0, cubeAction: null, source: "model" } },
          ],
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

beforeEach(() => {
  requests.length = 0;
  decision = {
    available: true,
    offer: "double",
    take: "drop",
    noDouble: 0.6,
    doubleTake: 0.7,
    doubleDrop: 0.65,
    cubeless: probs(0.7),
  };
});

function preRoll() {
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  pos.dice = null;
  return pos;
}

test("checker play is the engine's first move, not re-ranked", async () => {
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  pos.onRoll = "p1";
  pos.dice = [3, 1];
  const choice = await createGameEngineDriver(baseUrl).chooseChecker(pos, ctx);
  assert.deepEqual(choice.steps, [{ from: 8, to: 5 }, { from: 6, to: 5 }]);
  assert.deepEqual(requests, ["/evaluate"]);
});

test("offer and take come from the engine's /cube, asked once per position, with the side's ply", async () => {
  const driver = createGameEngineDriver(baseUrl, 3);
  const pos = preRoll();
  assert.equal(await driver.chooseOffer(pos, ctx), "double");
  assert.equal(await driver.chooseTake(pos, ctx), "drop");
  assert.deepEqual(requests, ["/cube?ply=3"]);
});

test("no take decision when the engine says the cube is not available", async () => {
  decision = { ...decision, available: false, offer: "no-double", take: null, noDouble: null, doubleTake: null, doubleDrop: null };
  const driver = createGameEngineDriver(baseUrl);
  assert.equal(await driver.chooseOffer(preRoll(), ctx), "no-double");
  await assert.rejects(driver.chooseTake(preRoll(), ctx), /no take decision/);
});

test("an engine error fails the decision", async () => {
  await assert.rejects(createGameEngineDriver("http://127.0.0.1:9").chooseOffer(preRoll(), ctx));
});
