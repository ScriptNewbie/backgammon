import type { Eval, Position, Step } from "ts-core";
import { infallibleCube, type MatchPlayer } from "ts-core/sim";
import { pickBestPlay } from "../rank";

export type EngineMoves = { moves: { steps: Step[]; eval: Eval }[] };

/** `POST /evaluate` URL. game-engine-fast takes `?ply=N` (docs/domain/game-engine-fast.md). */
export function evaluateUrl(baseUrl: string, ply?: number): string {
  const url = `${baseUrl.replace(/\/$/, "")}/evaluate`;
  return ply === undefined ? url : `${url}?ply=${ply}`;
}

export async function evaluateOnEngine(baseUrl: string, position: Position, ply?: number): Promise<EngineMoves> {
  const res = await fetch(evaluateUrl(baseUrl, ply), {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(position),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`evaluate ${res.status}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as EngineMoves;
}

export async function engineHealthCheck(baseUrl: string, hint: string): Promise<void> {
  const url = `${baseUrl.replace(/\/$/, "")}/health`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`engine health check failed at ${url} (${message}). ${hint}`);
  }
  if (!res.ok) {
    throw new Error(`engine health ${res.status} at ${url}. ${hint}`);
  }
}

/**
 * game-engine and game-engine-fast share the `/evaluate` contract. Both are re-ranked by mover MWC.
 * At ply >= 1 game-engine-fast returns only fully searched candidates (ADR 0028).
 */
export function createGameEngineDriver(baseUrl: string, ply?: number): MatchPlayer {
  return {
    ...infallibleCube(),
    async chooseChecker(pos, ctx) {
      const { moves } = await evaluateOnEngine(baseUrl, pos, ply);
      const best = pickBestPlay(moves, pos, ctx.phase);
      if (!best) return { steps: [], cubeless: null };
      return { steps: best.steps, cubeless: best.cubeless };
    },
  };
}
