import type { Position } from "../src/types.ts";

/** Test-only inverse of positionToXgid. Match length 0 is a money game (`match: null`). */
export function positionFromXgid(xgid: string): Position {
  const [board, cube, owner, turn, dice, s1, s2, crawford, length, maxCube] = xgid
    .replace(/^XGID=/, "")
    .split(":");
  const count = (ch: string): number =>
    ch === "-" ? 0 : ch >= "a" ? ch.charCodeAt(0) - 96 : -(ch.charCodeAt(0) - 64);
  const points: number[] = [];
  for (let i = 1; i <= 24; i++) points.push(-count(board![i]!));
  const bar = { p1: -count(board![25]!), p2: count(board![0]!) };
  const on = (sign: 1 | -1) =>
    points.reduce((sum, v) => sum + (Math.sign(v) === sign ? Math.abs(v) : 0), 0);
  const value = 2 ** Number(cube);
  const money = Number(length) === 0;
  const dead = Number(maxCube) === Number(cube) && (money || Number(crawford) === 0);
  const live = (money || Number(crawford) === 0) && !dead;
  const ownerName = owner === "1" ? "p1" : owner === "-1" ? "p2" : "centered";
  return {
    points,
    bar,
    off: { p1: 15 - on(1) - bar.p1, p2: 15 - on(-1) - bar.p2 },
    onRoll: turn === "1" ? "p1" : "p2",
    dice: dice === "00" ? null : [Number(dice![0]), Number(dice![1])],
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
      : { length: Number(length), score: { p1: Number(s1), p2: Number(s2) }, crawford: crawford === "1" },
  };
}
