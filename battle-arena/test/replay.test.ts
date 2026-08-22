import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { batchStamp, writeMatchSgf } from "../src/replay.ts";

test("batch stamp uses engine-vs-teacher suffix", () => {
  const { batchId, createdAt } = batchStamp(new Date("2026-08-22T12:15:00Z"));
  assert.equal(createdAt, "2026-08-22T12:15:00Z");
  assert.equal(batchId, "2026-08-22T121500Z-engine-vs-teacher");
});

test("writeMatchSgf writes GM[6] file", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "arena-"));
  try {
    const file = await writeMatchSgf({
      replaysRoot: root,
      batchId: "batch",
      matchId: "m1",
      sgf: "(;FF[4]GM[6])\n",
    });
    assert.equal(path.basename(file), "m1.sgf");
    const body = await readFile(file, "utf8");
    assert.match(body, /GM\[6\]/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
