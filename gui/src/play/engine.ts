import type { Position } from "ts-core";
import type { EngineMove } from "./rules";

/** Vite dev server proxies this prefix to the game-engine container (see vite.config.ts). */
const BASE = "/api/engine";

export class EngineError extends Error {}

export async function evaluate(position: Position): Promise<EngineMove[]> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/evaluate`, {
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
  const body = (await res.json()) as { moves: EngineMove[] };
  return body.moves;
}
