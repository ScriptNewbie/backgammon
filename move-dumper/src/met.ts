import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { MatchPhase, Player } from "./types";

type MetFile = {
  maxAway: number;
  crawford: number[][];
  postCrawfordLeader: Record<string, number>;
  postCrawfordTrailer: Record<string, number>;
};

const MET_PATH = fileURLToPath(
  new URL("../../docs/domain/data/kazaross-xg2-met.json", import.meta.url),
);

let cached: MetFile | undefined;

export function loadMet(): MetFile {
  if (!cached) {
    cached = JSON.parse(readFileSync(MET_PATH, "utf8")) as MetFile;
  }
  return cached;
}

/**
 * P(player at `stmAway` wins the match) vs opponent `oppAway`.
 * Away <= 0 means the game that just ended already decided the match.
 */
export function matchEquity(
  stmAway: number,
  oppAway: number,
  phase: MatchPhase,
): number {
  if (stmAway <= 0) return 1;
  if (oppAway <= 0) return 0;
  const met = loadMet();
  if (phase === "post") {
    if (stmAway === 1) {
      const v = met.postCrawfordLeader[String(oppAway)];
      if (v === undefined) throw new Error(`missing postCrawfordLeader[${oppAway}]`);
      return v;
    }
    const v = met.postCrawfordTrailer[String(stmAway)];
    if (v === undefined) throw new Error(`missing postCrawfordTrailer[${stmAway}]`);
    return v;
  }
  const row = met.crawford[stmAway - 1];
  const cell = row?.[oppAway - 1];
  if (cell === undefined) {
    throw new Error(`missing crawford[${stmAway}][${oppAway}]`);
  }
  return cell;
}

export function away(length: number, score: number): number {
  return length - score;
}

export function stmAwayAfter(
  length: number,
  score: { p1: number; p2: number },
  stm: Player,
  stmPoints: number,
  oppPoints: number,
): { stmAway: number; oppAway: number } {
  const opp: Player = stm === "p1" ? "p2" : "p1";
  return {
    stmAway: away(length, score[stm] + stmPoints),
    oppAway: away(length, score[opp] + oppPoints),
  };
}
