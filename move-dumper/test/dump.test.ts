import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { test } from "node:test";
import { fetchWithRetry } from "ts-core/bgweb";
import { DumpWriter } from "../src/dump.ts";
import type { DumpRecord } from "../src/types.ts";

function cubeRecord(id: string): DumpRecord {
  return {
    v: 1,
    id,
    matchId: "m",
    gameId: "g",
    ply: 0,
    decision: "cube",
    players: { p1: "midwit", p2: "midwit" },
    chosen: { action: "no-double" },
    position: {
      points: [-2, 0, 0, 0, 0, 5, 0, 3, 0, 0, 0, -5, 5, 0, 0, 0, -3, 0, -5, 0, 0, 0, 0, 2],
      bar: { p1: 0, p2: 0 },
      off: { p1: 0, p2: 0 },
      onRoll: "p1",
      dice: null,
      cube: { value: 1, owner: "centered", mayDouble: { p1: true, p2: true } },
      match: { length: 7, score: { p1: 0, p2: 0 }, crawford: false },
    },
    eval: null,
    moves: [],
    xgid: null,
  };
}

test("commitMatch leaves a gunzippable file before finish", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dump-"));
  try {
    const writer = await DumpWriter.create({
      dumpsRoot: root,
      seed: 1,
      baseUrl: "http://127.0.0.1:8080",
      now: new Date("2026-08-22T12:00:00Z"),
    });
    await writer.writeRecord(cubeRecord("a"));
    await writer.writeRecord(cubeRecord("b"));
    await writer.commitMatch();
    const gz = await readFile(path.join(writer.dir, "records.jsonl.gz"));
    const text = gunzipSync(gz).toString("utf8");
    const lines = text.trim().split("\n");
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]!).id, "a");
    const manifest = JSON.parse(await readFile(path.join(writer.dir, "manifest.json"), "utf8"));
    assert.equal(manifest.recordCount, 2);
    await writer.finish();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("two commits concatenate as one gzip JSONL", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dump-"));
  try {
    const writer = await DumpWriter.create({
      dumpsRoot: root,
      seed: 1,
      baseUrl: "http://127.0.0.1:8080",
      now: new Date("2026-08-22T12:00:01Z"),
    });
    await writer.writeRecord(cubeRecord("a"));
    await writer.commitMatch();
    await writer.writeRecord(cubeRecord("b"));
    await writer.commitMatch();
    const gz = await readFile(path.join(writer.dir, "records.jsonl.gz"));
    const lines = gunzipSync(gz).toString("utf8").trim().split("\n");
    assert.deepEqual(lines.map((l) => JSON.parse(l).id), ["a", "b"]);
    await writer.finish();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fetchWithRetry succeeds after transient failures", async () => {
  let n = 0;
  const logs: string[] = [];
  const res = await fetchWithRetry(
    "http://example.test/api",
    { method: "POST", body: "{}" },
    {
      sleep: async () => undefined,
      log: (msg) => logs.push(msg),
      fetch: async () => {
        n += 1;
        if (n === 1) throw new Error("fetch failed");
        if (n === 2) return new Response("busy", { status: 503 });
        return new Response("[]", { status: 200 });
      },
    },
  );
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "[]");
  assert.equal(n, 3);
  assert.equal(logs.length, 2);
});

test("fetchWithRetry does not retry 4xx", async () => {
  await assert.rejects(
    () =>
      fetchWithRetry(
        "http://example.test/api",
        { method: "POST" },
        {
          fetch: async () => new Response("nope", { status: 400 }),
        },
      ),
    /getmoves 400/,
  );
});
