import assert from "node:assert/strict";
import { test } from "node:test";
import { openingPosition, type Position } from "ts-core";
import type { GnubgCubeAnalysis } from "ts-core/gnubg";
import type { CubeEval } from "ts-core/sim";
import { createGnubgDriver } from "../src/drivers/gnubg.ts";

const ctx = { matchId: "m", gameId: "g", ply: 3, phase: "pre" as const };

function cubeEval(offer: "double" | "no-double", take: "take" | "drop"): CubeEval {
  return { infallibleOffer: offer, infallibleTake: take } as CubeEval;
}

function fakeClient(analysis: Omit<GnubgCubeAnalysis, "xgid">) {
  const asked: Position[] = [];
  return {
    asked,
    async chooseChecker(pos: Position) {
      asked.push(pos);
      return { steps: [{ from: 8, to: 5 }, { from: 6, to: 5 }], cubeless: null };
    },
    async cubeAction(pos: Position) {
      asked.push(pos);
      return { xgid: "x", ...analysis };
    },
  };
}

test("gnubg plays its own checker move, offer, and take, ignoring the infallible heuristic", async () => {
  const client = fakeClient({ action: "Double, pass", offer: "double", take: "drop" });
  const driver = createGnubgDriver(client);
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  assert.equal((await driver.chooseChecker({ ...pos, dice: [3, 1] }, ctx)).steps.length, 2);
  assert.equal(await driver.chooseOffer(pos, cubeEval("no-double", "take"), ctx), "double");
  assert.equal(await driver.chooseTake(pos, cubeEval("no-double", "take"), ctx), "drop");
  assert.equal(client.asked.length, 3);
});

test("a take with no gnubg cube analysis fails instead of guessing", async () => {
  const driver = createGnubgDriver(fakeClient({ action: "You cannot double", offer: "no-double", take: null }));
  const pos = openingPosition(7, { p1: 0, p2: 0 }, "pre");
  await assert.rejects(driver.chooseTake(pos, cubeEval("double", "take"), ctx), /no take decision/);
});
