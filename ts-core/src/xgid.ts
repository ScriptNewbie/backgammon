import type { Position } from "./types";

/**
 * XGID codec (representation 3). Isomorphic: the sidecars and the `board` widget
 * both use it, and neither stores the string. p1 is the bottom player (uppercase,
 * bears off toward 1). The checker string does not flip when p2 is on roll.
 * `off` and `mayDouble` are derived; XGID has no fields for them.
 */

const MAX_CUBE_EXP = 6;

function cubeExponent(value: number): number {
  const exp = Math.round(Math.log2(value));
  if (2 ** exp !== value || exp < 0 || exp > MAX_CUBE_EXP) {
    throw new Error(`cube value must be 1,2,4,8,16,32,64 (got ${value})`);
  }
  return exp;
}

function checkerChar(count: number, upper: boolean): string {
  if (count === 0) return "-";
  if (count < 0 || count > 15) throw new Error(`invalid checker count ${count}`);
  const base = upper ? 65 : 97;
  return String.fromCharCode(base + count - 1);
}

function intField(name: string, raw: string): number {
  if (!/^-?\d+$/.test(raw)) throw new Error(`XGID ${name} is not an integer`);
  return Number(raw);
}

function checkerCount(ch: string, upper: boolean): number {
  if (ch === "-") return 0;
  const code = ch.charCodeAt(0);
  if (upper) {
    if (code < 65 || code > 79) throw new Error(`XGID checker ${ch} is not A–O`);
    return code - 64;
  }
  if (code < 97 || code > 111) throw new Error(`XGID checker ${ch} is not a–o`);
  return code - 96;
}

/** XGID for a position. Dice null means "to roll or double" (`00`). */
export function positionToXgid(position: Position): string {
  if (position.points.length !== 24) throw new Error("position.points must have length 24");
  let board = checkerChar(position.bar.p2, false);
  for (const v of position.points) board += v >= 0 ? checkerChar(v, true) : checkerChar(-v, false);
  board += checkerChar(position.bar.p1, true);

  const exp = cubeExponent(position.cube.value);
  const owner = position.cube.owner === "p1" ? 1 : position.cube.owner === "p2" ? -1 : 0;
  const turn = position.onRoll === "p1" ? 1 : -1;
  const dice = position.dice ? `${position.dice[0]}${position.dice[1]}` : "00";
  const match = position.match;
  const crawford = match?.crawford ? 1 : 0;
  // XG has no dead-cube flag. Outside Crawford, a cube nobody may turn is capped at its value.
  const dead = !crawford && !position.cube.mayDouble.p1 && !position.cube.mayDouble.p2;
  const maxCube = dead ? exp : MAX_CUBE_EXP;
  return [
    `XGID=${board}`,
    exp,
    owner,
    turn,
    dice,
    match?.score.p1 ?? 0,
    match?.score.p2 ?? 0,
    crawford,
    match?.length ?? 0,
    maxCube,
  ].join(":");
}

/**
 * Position JSON for an XGID. Match length 0 is a money game (`match: null`).
 * Borne-off checkers are 15 minus the checkers on points and the bar.
 */
export function positionFromXgid(xgid: string): Position {
  if (!xgid.startsWith("XGID=")) throw new Error("XGID must start with XGID=");
  const parts = xgid.slice("XGID=".length).split(":");
  if (parts.length !== 10) throw new Error("XGID must have 10 fields");
  const [board, cube, owner, turn, dice, s1, s2, crawford, length, maxCube] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if (board.length !== 26) throw new Error("XGID board must be 26 characters");
  const exp = intField("cube", cube);
  if (exp < 0 || exp > MAX_CUBE_EXP) throw new Error(`XGID cube exponent ${cube} is out of range`);
  if (owner !== "1" && owner !== "-1" && owner !== "0") throw new Error(`XGID owner ${owner} is not 1, -1, or 0`);
  if (turn !== "1" && turn !== "-1") throw new Error(`XGID turn ${turn} is not 1 or -1`);
  if (!/^(?:[1-6]{2}|00)$/.test(dice)) throw new Error(`XGID dice ${dice} is not 00 or two faces`);
  const score1 = intField("score1", s1);
  const score2 = intField("score2", s2);
  const crawfordFlag = intField("crawford", crawford);
  const matchLength = intField("length", length);
  const max = intField("maxcube", maxCube);
  if (crawfordFlag !== 0 && crawfordFlag !== 1) throw new Error("XGID crawford must be 0 or 1");
  if (matchLength < 0) throw new Error("XGID length must be >= 0");
  if (score1 < 0 || score2 < 0) throw new Error("XGID scores must be >= 0");
  if (max < 0) throw new Error("XGID maxcube is out of range");

  const points: number[] = [];
  for (let i = 1; i <= 24; i++) {
    const ch = board[i]!;
    if (ch === "-") points.push(0);
    else if (ch >= "a") points.push(-checkerCount(ch, false));
    else points.push(checkerCount(ch, true));
  }
  const bar = { p1: checkerCount(board[25]!, true), p2: checkerCount(board[0]!, false) };
  const on = (sign: 1 | -1) => points.reduce((sum, v) => sum + (Math.sign(v) === sign ? Math.abs(v) : 0), 0);
  const off = { p1: 15 - on(1) - bar.p1, p2: 15 - on(-1) - bar.p2 };
  if (off.p1 < 0 || off.p2 < 0) throw new Error("XGID has more than 15 checkers for a player");

  const value = 2 ** exp;
  const money = matchLength === 0;
  const dead = max === exp && (money || crawfordFlag === 0);
  const live = (money || crawfordFlag === 0) && !dead;
  const ownerName = owner === "1" ? "p1" : owner === "-1" ? "p2" : "centered";
  return {
    points,
    bar,
    off,
    onRoll: turn === "1" ? "p1" : "p2",
    dice: dice === "00" ? null : [Number(dice[0]), Number(dice[1])],
    cube: {
      value,
      owner: ownerName,
      mayDouble: {
        p1: live && ownerName !== "p2",
        p2: live && ownerName !== "p1",
      },
    },
    match: money
      ? null
      : { length: matchLength, score: { p1: score1, p2: score2 }, crawford: crawfordFlag === 1 },
  };
}
