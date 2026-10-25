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
