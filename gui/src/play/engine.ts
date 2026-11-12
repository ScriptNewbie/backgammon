import type { CubeDecision, Position } from "ts-core";
import type { EngineMove } from "./rules";

/** Vite dev server proxies this prefix to the game-engine container (see vite.config.ts). */
const BASE = "/api/engine";

export class EngineError extends Error {}

async function post<T>(route: "evaluate" | "cube", position: Position): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/${route}`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(position),
    });
  } catch (err) {
    throw new EngineError(`game-engine unreachable: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    const text = await res.text();
    if (res.status >= 500) {
      throw new EngineError(
        `game-engine unreachable (${res.status}). Start it with "docker compose up" in game-engine/.`,
      );
    }
    throw new EngineError(`game-engine ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** Legal plays, best first for the engine at the match score: `moves[0]` is the engine's play. */
export async function evaluate(position: Position): Promise<EngineMove[]> {
  return (await post<{ moves: EngineMove[] }>("evaluate", position)).moves;
}

/** The engine's cube decision with `position.onRoll` as the doubler (dice null), ADR 0032. */
export async function cube(position: Position): Promise<CubeDecision> {
  return post<CubeDecision>("cube", { ...position, dice: null });
}
