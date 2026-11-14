import type { SideId } from "./sides";

export type MatchSummaryRow = {
  winner: SideId;
  /** Seat side A sat this match. */
  aSeat: "p1" | "p2";
  games: number;
  points: { a: number; b: number };
};

export type BattleSummary = {
  matches: number;
  games: number;
  length: number;
  seed: number;
  allowCube: boolean;
  sides: { a: string; b: string };
  wins: { a: number; b: number };
  winsAsP1: { a: number; b: number };
  winsAsP2: { a: number; b: number };
  points: { a: number; b: number };
};

export function winnerSide(aSeat: "p1" | "p2", seat: "p1" | "p2"): SideId {
  return seat === aSeat ? "a" : "b";
}

export function summarize(
  rows: readonly MatchSummaryRow[],
  opts: { length: number; seed: number; allowCube?: boolean; sides: { a: string; b: string } },
): BattleSummary {
  const summary: BattleSummary = {
    matches: rows.length,
    games: 0,
    length: opts.length,
    seed: opts.seed,
    allowCube: opts.allowCube !== false,
    sides: opts.sides,
    wins: { a: 0, b: 0 },
    winsAsP1: { a: 0, b: 0 },
    winsAsP2: { a: 0, b: 0 },
    points: { a: 0, b: 0 },
  };
  for (const row of rows) {
    summary.wins[row.winner] += 1;
    const winnerSeat = row.winner === "a" ? row.aSeat : row.aSeat === "p1" ? "p2" : "p1";
    if (winnerSeat === "p1") summary.winsAsP1[row.winner] += 1;
    else summary.winsAsP2[row.winner] += 1;
    summary.games += row.games;
    summary.points.a += row.points.a;
    summary.points.b += row.points.b;
  }
  return summary;
}

export function formatSummary(summary: BattleSummary): string {
  const lines = [
    `a ${summary.sides.a} vs b ${summary.sides.b}`,
    `matches: ${summary.matches}  games: ${summary.games}  length: ${summary.length}  seed: ${summary.seed}  cube: ${summary.allowCube ? "on" : "off"}`,
    `a: ${summary.wins.a} wins (as p1: ${summary.winsAsP1.a}, as p2: ${summary.winsAsP2.a})  points: ${summary.points.a}`,
    `b: ${summary.wins.b} wins (as p1: ${summary.winsAsP1.b}, as p2: ${summary.winsAsP2.b})  points: ${summary.points.b}`,
  ];
  return lines.join("\n");
}

/** One money game (ADR 0034), from side A's point of view. */
export type MoneyGameRow = {
  aSeat: "p1" | "p2";
  winner: SideId;
  /** Points side A won (negative when it lost): cube value × 1/2/3. */
  aPoints: number;
};

export type MoneySummary = {
  games: number;
  seed: number;
  allowCube: boolean;
  sides: { a: string; b: string };
  wins: { a: number; b: number };
  points: { a: number; b: number };
  /** Side A's mean points per game and its standard error (0 with fewer than two games). */
  ppg: number;
  stdErr: number;
};

export function summarizeMoney(
  rows: readonly MoneyGameRow[],
  opts: { seed: number; allowCube?: boolean; sides: { a: string; b: string } },
): MoneySummary {
  const n = rows.length;
  const net = rows.reduce((s, r) => s + r.aPoints, 0);
  const ppg = n > 0 ? net / n : 0;
  const variance = n > 1 ? rows.reduce((s, r) => s + (r.aPoints - ppg) ** 2, 0) / (n - 1) : 0;
  return {
    games: n,
    seed: opts.seed,
    allowCube: opts.allowCube !== false,
    sides: opts.sides,
    wins: { a: rows.filter((r) => r.winner === "a").length, b: rows.filter((r) => r.winner === "b").length },
    points: {
      a: rows.reduce((s, r) => s + Math.max(0, r.aPoints), 0),
      b: rows.reduce((s, r) => s + Math.max(0, -r.aPoints), 0),
    },
    ppg,
    stdErr: n > 1 ? Math.sqrt(variance / n) : 0,
  };
}

function signed(x: number): string {
  return `${x >= 0 ? "+" : ""}${x.toFixed(3)}`;
}

export function formatMoneySummary(s: MoneySummary): string {
  return [
    `a ${s.sides.a} vs b ${s.sides.b}`,
    `money games: ${s.games}  seed: ${s.seed}  cube: ${s.allowCube ? "on" : "off"}`,
    `a: ${s.wins.a} wins  points won: ${s.points.a}  ppg: ${signed(s.ppg)} ± ${s.stdErr.toFixed(3)}`,
    `b: ${s.wins.b} wins  points won: ${s.points.b}  ppg: ${signed(-s.ppg)} ± ${s.stdErr.toFixed(3)}`,
  ].join("\n");
}
