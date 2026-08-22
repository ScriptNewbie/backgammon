import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeCheckerMove, renderMatchSgf } from "../src/sgf.ts";

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
  assert.match(sgf, /AP\[move-dumper:1\]/);
  assert.match(sgf, /PW\[p1-infallible\]PB\[p2-infallible\]/);
  assert.match(sgf, /MI\[length:1\]\[game:0\]\[ws:0\]\[bs:0\]/);
  assert.match(sgf, /;W\[31hefe\]/);
  assert.match(sgf, /RE\[W\+1\]/);
});

test("arena SGF uses engine/teacher names and AP", () => {
  const sgf = renderMatchSgf(
    [
      {
        length: 7,
        gameIndex: 0,
        ws: 0,
        bs: 0,
        p1: "game-engine",
        p2: "teacher",
        phase: "pre",
        events: [],
        result: { winner: "p2", points: 1 },
      },
    ],
    { app: "battle-arena:1" },
  );
  assert.match(sgf, /AP\[battle-arena:1\]/);
  assert.match(sgf, /PW\[p1-game-engine\]PB\[p2-teacher\]/);
  assert.match(sgf, /RE\[B\+1\]/);
});
