import type { CubeDecision, Position, Step, Eval } from "ts-core";
import type { MatchPlayer } from "ts-core/sim";

export type EngineMoves = { moves: { steps: Step[]; eval: Eval }[] };

/** Engine route URL. game-engine-fast takes `?ply=N` (docs/domain/game-engine-fast.md). */
export function engineUrl(baseUrl: string, route: "evaluate" | "cube", ply?: number): string {
  const url = `${baseUrl.replace(/\/$/, "")}/${route}`;
  return ply === undefined ? url : `${url}?ply=${ply}`;
}

async function postPosition<T>(url: string, position: Position, route: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(position),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${route} ${res.status}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

export async function evaluateOnEngine(baseUrl: string, position: Position, ply?: number): Promise<EngineMoves> {
  return postPosition(engineUrl(baseUrl, "evaluate", ply), position, "evaluate");
}

export async function cubeOnEngine(baseUrl: string, position: Position, ply?: number): Promise<CubeDecision> {
  return postPosition(engineUrl(baseUrl, "cube", ply), position, "cube");
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
 * game-engine and game-engine-fast (ADR 0032): the engine decides. Checker play is the first of
 * `/evaluate`'s moves (the engine orders them for the mover at the match score); offer and take
 * come from the engine's own `/cube` on the position with the doubler on roll. The arena does
 * not re-rank or override either. `ply` is passed to both routes (game-engine-fast only).
 */
export function createGameEngineDriver(baseUrl: string, ply?: number): MatchPlayer {
  let last: { key: string; decision: CubeDecision } | null = null;
  async function cube(pos: Position): Promise<CubeDecision> {
    const key = JSON.stringify(pos);
    if (last?.key !== key) last = { key, decision: await cubeOnEngine(baseUrl, pos, ply) };
    return last.decision;
  }
  return {
    async chooseChecker(pos) {
      const { moves } = await evaluateOnEngine(baseUrl, pos, ply);
      const best = moves[0];
      return { steps: best?.steps ?? [], cubeless: best?.eval.cubeless ?? null };
    },
    async chooseOffer(pos) {
      return (await cube(pos)).offer;
    },
    async chooseTake(pos) {
      const decision = await cube(pos);
      if (!decision.take) throw new Error("engine has no take decision here (cube not available)");
      return decision.take;
    },
  };
}
