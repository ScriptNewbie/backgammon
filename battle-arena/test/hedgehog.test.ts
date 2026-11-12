import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";
import { applySteps, generateLegalPlays, openingPosition, stepsKey, type Position } from "ts-core";
import { HedgehogClient, positionToOgid, type HedgehogMoveJson } from "ts-core/hedgehog";
import type { CubeEval } from "ts-core/sim";
import { createHedgehogDriver } from "../src/drivers/hedgehog.ts";

type Query = { path: string; ogid: string; ply: number };

const queries: Query[] = [];
let health: Record<string, unknown> = { ok: true, model: "aureus.ogxf", maxPly: 1, api: 2 };
let movesFor: (ogid: string) => HedgehogMoveJson[] = () => [];
let cubeBody: Record<string, unknown> = {};
let server: Server;
let baseUrl = "";

before(async () => {
  server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/health") {
      res.end(JSON.stringify(health));
      return;
    }
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const body = JSON.parse(raw) as { ogid: string; ply: number };
      queries.push({ path: req.url ?? "", ...body });
      if (req.url === "/v1/moves") {
        res.end(JSON.stringify({ ply: body.ply, moves: movesFor(body.ogid) }));
        return;
      }
      if (req.url === "/v1/cube") {
        res.end(JSON.stringify({ ply: body.ply, ...cubeBody }));
        return;
      }
      res.statusCode = 404;
      res.end("{}");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

beforeEach(() => {
  queries.length = 0;
  health = { ok: true, model: "aureus.ogxf", maxPly: 1, api: 2 };
});

const ctx = { matchId: "m", gameId: "g", ply: 3, phase: "pre" as const };

function hitPosition(): Position {
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  pos.points[0] = -1;
  pos.points[2] = -1;
  pos.dice = [3, 1];
  return pos;
}

function cubeEval(offer: "double" | "no-double", take: "take" | "drop"): CubeEval {
  return { infallibleOffer: offer, infallibleTake: take } as CubeEval;
}

/** Every legal successor, best first by `match_equity`, with `top` moved to the front. */
function sidecarMoves(pos: Position, top: string): HedgehogMoveJson[] {
  const plays = generateLegalPlays(pos);
  plays.sort((a, b) => (stepsKey(a) === top ? -1 : stepsKey(b) === top ? 1 : 0));
  return plays.map((steps, i) => {
    const next = applySteps(pos, steps);
    next.onRoll = next.onRoll === "p1" ? "p2" : "p1";
    next.dice = null;
    return {
      ogid: positionToOgid(next),
      // The top play has the lowest win chance: a client that re-ranked would not pick it.
      win: i === 0 ? 0.3 : 0.6,
      gammon_win: 0.1,
      bg_win: 0,
      gammon_loss: 0.1,
      bg_loss: 0,
      equity: i === 0 ? -0.4 : 0.2,
      match_equity: 1 - i * 0.01,
    };
  });
}

test("health check needs the api 2 sidecar", async () => {
  const client = new HedgehogClient(baseUrl);
  await client.healthCheck();
  assert.equal(client.model, "aureus.ogxf");
  health = { ok: true, model: "aureus.ogxf", maxPly: 1 };
  await assert.rejects(new HedgehogClient(baseUrl).healthCheck(), /api 1.*rebuild the image/);
});

test("hedgehog checker play is the sidecar's top play, not re-ranked", async () => {
  const pos = hitPosition();
  const top = stepsKey(generateLegalPlays(pos).at(-1)!);
  movesFor = () => sidecarMoves(pos, top);
  const driver = createHedgehogDriver(new HedgehogClient(baseUrl, 0));
  const choice = await driver.chooseChecker(pos, ctx);
  assert.equal(stepsKey(choice.steps), top);
  assert.ok(choice.cubeless);
  // Mover probabilities flipped to the player about to move.
  assert.ok(Math.abs(choice.cubeless.win - 0.7) < 1e-9);
  assert.deepEqual(queries, [{ path: "/v1/moves", ogid: positionToOgid(pos), ply: 0 }]);
});

test("moves that are not best first fail the decision", async () => {
  const pos = hitPosition();
  movesFor = () => sidecarMoves(pos, "").reverse();
  await assert.rejects(new HedgehogClient(baseUrl).chooseChecker(pos), /not best first/);
});

test("moves without match_equity mean an old sidecar", async () => {
  const pos = hitPosition();
  movesFor = () => sidecarMoves(pos, "").map(({ match_equity: _drop, ...rest }) => rest);
  await assert.rejects(new HedgehogClient(baseUrl).chooseChecker(pos), /rebuild the sidecar/);
});

test("hedgehog offer and take come from the sidecar, asked once, without dice", async () => {
  cubeBody = { action: "Double, pass", offer: "double", take: "drop", available: true };
  const driver = createHedgehogDriver(new HedgehogClient(baseUrl, 1));
  const pos = hitPosition();
  pos.dice = null;
  assert.equal(await driver.chooseOffer(pos, cubeEval("no-double", "take"), ctx), "double");
  assert.equal(await driver.chooseTake(pos, cubeEval("no-double", "take"), ctx), "drop");
  assert.equal(queries.length, 1);
  assert.equal(queries[0]!.path, "/v1/cube");
  assert.equal(queries[0]!.ply, 1);
  assert.equal(queries[0]!.ogid, positionToOgid(pos));
  assert.match(queries[0]!.ogid, /:N0N::W:C:0:0:7:0$/);
});

test("an unknown cube answer fails the decision", async () => {
  cubeBody = { action: "?", offer: "beaver", take: "take" };
  const driver = createHedgehogDriver(new HedgehogClient(baseUrl));
  const pos = hitPosition();
  pos.dice = null;
  await assert.rejects(driver.chooseOffer(pos, cubeEval("no-double", "take"), ctx), /offer is not recognised/);
});
