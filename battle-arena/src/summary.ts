export type EngineId = "game-engine" | "teacher";

export type MatchSummaryRow = {
  winner: EngineId;
  engineSeat: "p1" | "p2";
  games: number;
  points: { "game-engine": number; teacher: number };
};

export type BattleSummary = {
  matches: number;
  length: number;
  seed: number;
  wins: { "game-engine": number; teacher: number };
  winsAsP1: { "game-engine": number; teacher: number };
  winsAsP2: { "game-engine": number; teacher: number };
  games: { "game-engine": number; teacher: number };
  points: { "game-engine": number; teacher: number };
};

export function engineAtSeat(engineSeat: "p1" | "p2", seat: "p1" | "p2"): EngineId {
  if (seat === engineSeat) return "game-engine";
  return "teacher";
}

export function summarize(rows: readonly MatchSummaryRow[], opts: { length: number; seed: number }): BattleSummary {
  const summary: BattleSummary = {
    matches: rows.length,
    length: opts.length,
    seed: opts.seed,
    wins: { "game-engine": 0, teacher: 0 },
    winsAsP1: { "game-engine": 0, teacher: 0 },
    winsAsP2: { "game-engine": 0, teacher: 0 },
    games: { "game-engine": 0, teacher: 0 },
    points: { "game-engine": 0, teacher: 0 },
  };
  for (const row of rows) {
    summary.wins[row.winner] += 1;
    if (row.engineSeat === "p1") summary.winsAsP1[row.winner] += 1;
    else summary.winsAsP2[row.winner] += 1;
    summary.games["game-engine"] += row.games;
    summary.points["game-engine"] += row.points["game-engine"];
    summary.points.teacher += row.points.teacher;
  }
  summary.games.teacher = summary.games["game-engine"];
  return summary;
}

export function formatSummary(summary: BattleSummary): string {
  const lines = [
    `engine vs teacher`,
    `matches: ${summary.matches}  length: ${summary.length}  seed: ${summary.seed}`,
    `game-engine: ${summary.wins["game-engine"]} wins (as p1: ${summary.winsAsP1["game-engine"]}, as p2: ${summary.winsAsP2["game-engine"]})  points: ${summary.points["game-engine"]}`,
    `teacher: ${summary.wins.teacher} wins (as p1: ${summary.winsAsP1.teacher}, as p2: ${summary.winsAsP2.teacher})  points: ${summary.points.teacher}`,
  ];
  return lines.join("\n");
}
