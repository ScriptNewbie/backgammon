import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { test } from "node:test";
import { stepsKey, type LegalPlay, type Position } from "ts-core";
import type { GnubgClient } from "ts-core/gnubg";
import { legalPlaysByBoard } from "ts-core/notation";
import { DumpWriter } from "../src/dump.ts";
import { dumpGames } from "../src/games.ts";
import type { DumpRecord } from "../src/types.ts";

/** Stand-in teacher: every legal play, a made-up equity from its steps, and a random delay so parallel games interleave. */
function fakeClient(): GnubgClient {
  return {
    async getMoves(pos: Position) {
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 2));
      const plays: LegalPlay[] = [...legalPlaysByBoard(pos).values()].map((steps) => {
        const key = stepsKey(steps);
        let h = 0;
        for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
        const win = 0.2 + 0.6 * ((h % 1000) / 1000);
        return {
          steps,
          teacherDiff: 0,
          eval: {
            cubeless: { equity: 2 * win - 1, win, gammon: 0, backgammon: 0, loseGammon: 0, loseBackgammon: 0 },
            cubefulEquity: 0,
            cubeAction: null,
            source: "gnubg",
          },
        };
      });
      return { plays, ply: 2 };
    },
  } as unknown as GnubgClient;
}

async function dumpedGames(root: string, concurrency: number, second: number): Promise<string[]> {
  const writer = await DumpWriter.create({
    dumpsRoot: root,
    seed: 5,
    baseUrl: "http://fake",
    ply: 2,
    labelFilter: "all",
    version: "fake",
    now: new Date(`2026-08-22T12:00:0${second}Z`),
  });
  await dumpGames(fakeClient(), 5, writer, 6, concurrency);
  const { dir } = await writer.finish();
  const records: DumpRecord[] = gunzipSync(await readFile(path.join(dir, "records.jsonl.gz")))
    .toString("utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  // Records of a game are contiguous; describe each game by its levels and chosen plays.
  const games: string[] = [];
  let current = "";
  let gameId = "";
  for (const r of records) {
    if (r.gameId !== gameId) {
      if (gameId) games.push(current);
      gameId = r.gameId;
      current = `${r.players.p1}/${r.players.p2}:`;
    }
    current += `${stepsKey(r.chosen.steps)};`;
  }
  games.push(current);
  return games;
}

test("parallel games are the same games as one at a time, each kept together", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dump-"));
  try {
    const serial = await dumpedGames(root, 1, 0);
    const parallel = await dumpedGames(root, 4, 1);
    assert.equal(serial.length, 6);
    assert.equal(parallel.length, 6);
    assert.deepEqual([...parallel].sort(), [...serial].sort());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
