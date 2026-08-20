import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgs } from "../src/cli.ts";
import { batchStamp, buildManifest } from "../src/dump.ts";
import { encodeCheckerMove, renderMatchSgf } from "../src/sgf.ts";
import { rollOpening } from "../src/match.ts";
import { Rng } from "../src/rng.ts";

test("opening 31 8/5 6/5 encodes as 31hefe", () => {
  assert.equal(
    encodeCheckerMove([3, 1], [
      { from: 8, to: 5 },
      { from: 6, to: 5 },
    ]),
    "31hefe",
  );
});

test("bar and off are y and z", () => {
  assert.equal(encodeCheckerMove([6, 1], [{ from: "bar", to: 18 }]), "61yr");
  assert.equal(encodeCheckerMove([2, 1], [{ from: 1, to: "off" }]), "21az");
});

test("SGF is GNU Backgammon GM[6] with PW=p1", () => {
  const sgf = renderMatchSgf([
    {
      length: 1,
      gameIndex: 0,
      ws: 0,
      bs: 0,
      p1: "infallible",
      p2: "infallible",
      phase: "crawford",
      events: [
        {
          kind: "move",
          player: "p1",
          dice: [3, 1],
          steps: [
            { from: 8, to: 5 },
            { from: 6, to: 5 },
          ],
        },
      ],
      result: { winner: "p1", points: 1 },
    },
  ]);
  assert.match(sgf, /FF\[4\]GM\[6\]/);
  assert.match(sgf, /PW\[p1-infallible\]PB\[p2-infallible\]/);
  assert.match(sgf, /MI\[length:1\]\[game:0\]\[ws:0\]\[bs:0\]/);
  assert.match(sgf, /;W\[31hefe\]/);
  assert.match(sgf, /RE\[W\+1\]/);
});

test("batch stamp matches dump-format compact UTC", () => {
  const { batchId, createdAt } = batchStamp(new Date("2026-08-20T20:46:00Z"));
  assert.equal(createdAt, "2026-08-20T20:46:00Z");
  assert.equal(batchId, "2026-08-20T204600Z-bgweb-api");
});

test("manifest engine is bgweb-api match play", () => {
  const manifest = buildManifest({
    batchId: "example",
    createdAt: "2026-08-20T20:46:00Z",
    seed: 1,
    baseUrl: "http://127.0.0.1:8080",
    recordCount: 0,
    plies: 1,
  });
  assert.equal(manifest.engine.name, "bgweb-api");
  assert.equal(manifest.engine.settings.play, "match");
  assert.equal(manifest.engine.settings.cubefulLabels, true);
  assert.equal(manifest.engine.settings.met, "kazaross-xg2");
  assert.deepEqual(manifest.engine.settings.matchLengths, [1, 3, 5, 7, 9, 11, 13, 15]);
});

test("CLI defaults", () => {
  const prev = process.env.BGWEB_BASE_URL;
  delete process.env.BGWEB_BASE_URL;
  try {
    const args = parseArgs([]);
    assert.equal(args.matches, 1);
    assert.equal(args.seed, 1);
    assert.equal(args.baseUrl, "http://127.0.0.1:8080");
  } finally {
    if (prev === undefined) delete process.env.BGWEB_BASE_URL;
    else process.env.BGWEB_BASE_URL = prev;
  }
});

test("CLI reads BGWEB_BASE_URL", () => {
  const prev = process.env.BGWEB_BASE_URL;
  process.env.BGWEB_BASE_URL = "http://bgweb-api:8080";
  try {
    assert.equal(parseArgs([]).baseUrl, "http://bgweb-api:8080");
  } finally {
    if (prev === undefined) delete process.env.BGWEB_BASE_URL;
    else process.env.BGWEB_BASE_URL = prev;
  }
});

test("opening dice are never doubles; higher player is on roll", () => {
  const rng = new Rng(7);
  for (let i = 0; i < 50; i++) {
    const roll = rollOpening(rng);
    assert.notEqual(roll.dice[0], roll.dice[1]);
    assert.ok(roll.dice[0] > roll.dice[1]);
    if (roll.onRoll === "p1") assert.ok(roll.dice[0] >= 1);
  }
});
