import { assertFifteen, type Position } from "ts-core";

const CUBE_VALUES = new Set([1, 2, 4, 8, 16, 32, 64]);

function isPlayer(v: unknown): v is "p1" | "p2" {
  return v === "p1" || v === "p2";
}

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

function counts(raw: unknown, label: string): { p1: number; p2: number } {
  if (!raw || typeof raw !== "object") throw new Error(`${label} required`);
  const o = raw as Record<string, unknown>;
  if (!isInt(o.p1, 0, 15) || !isInt(o.p2, 0, 15)) {
    throw new Error(`${label}.p1 and ${label}.p2 must be integers 0-15`);
  }
  return { p1: o.p1, p2: o.p2 };
}

export function parseEvaluateBody(body: unknown): Position {
  if (!body || typeof body !== "object") throw new Error("position object required");
  const raw = body as Record<string, unknown>;
  if (!Array.isArray(raw.points) || raw.points.length !== 24) {
    throw new Error("points must be length 24");
  }
  const points = raw.points.map((n, i) => {
    if (typeof n !== "number" || !Number.isFinite(n) || !Number.isInteger(n)) {
      throw new Error(`points[${i}] must be an integer`);
    }
    return n;
  });
  if (!isPlayer(raw.onRoll)) throw new Error("onRoll must be p1 or p2");
  if (!Array.isArray(raw.dice) || raw.dice.length !== 2) {
    throw new Error("dice must be two ints 1-6");
  }
  const d1 = raw.dice[0];
  const d2 = raw.dice[1];
  if (!isInt(d1, 1, 6) || !isInt(d2, 1, 6)) throw new Error("dice must be two ints 1-6");

  if (!raw.cube || typeof raw.cube !== "object") throw new Error("cube required");
  const cubeRaw = raw.cube as Record<string, unknown>;
  if (typeof cubeRaw.value !== "number" || !CUBE_VALUES.has(cubeRaw.value)) {
    throw new Error("cube.value must be 1, 2, 4, 8, 16, 32, or 64");
  }
  if (cubeRaw.owner !== "centered" && !isPlayer(cubeRaw.owner)) {
    throw new Error("cube.owner must be centered, p1, or p2");
  }
  if (!cubeRaw.mayDouble || typeof cubeRaw.mayDouble !== "object") {
    throw new Error("cube.mayDouble required");
  }
  const may = cubeRaw.mayDouble as Record<string, unknown>;
  if (typeof may.p1 !== "boolean" || typeof may.p2 !== "boolean") {
    throw new Error("cube.mayDouble.p1/p2 must be boolean");
  }

  if (!raw.match || typeof raw.match !== "object") throw new Error("match required");
  const matchRaw = raw.match as Record<string, unknown>;
  if (!isInt(matchRaw.length, 1, 15)) throw new Error("match.length must be a positive integer");
  if (!matchRaw.score || typeof matchRaw.score !== "object") throw new Error("match.score required");
  const scoreRaw = matchRaw.score as Record<string, unknown>;
  if (!isInt(scoreRaw.p1, 0, matchRaw.length) || !isInt(scoreRaw.p2, 0, matchRaw.length)) {
    throw new Error("match.score.p1/p2 must be integers");
  }
  if (typeof matchRaw.crawford !== "boolean") throw new Error("match.crawford must be boolean");

  const position: Position = {
    points,
    bar: counts(raw.bar, "bar"),
    off: counts(raw.off, "off"),
    onRoll: raw.onRoll,
    dice: [d1, d2],
    cube: {
      value: cubeRaw.value,
      owner: cubeRaw.owner,
      mayDouble: { p1: may.p1, p2: may.p2 },
    },
    match: {
      length: matchRaw.length,
      score: { p1: scoreRaw.p1, p2: scoreRaw.p2 },
      crawford: matchRaw.crawford,
    },
  };
  assertFifteen(position);
  return position;
}
