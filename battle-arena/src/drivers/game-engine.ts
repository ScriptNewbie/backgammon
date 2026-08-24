import type { Eval, Position, Step } from "ts-core";
import { infallibleCube, type MatchPlayer } from "ts-core/sim";
import { pickBestPlay } from "../rank";

export type EngineMoves = { moves: { steps: Step[]; eval: Eval }[] };

export async function evaluateOnEngine(baseUrl: string, position: Position): Promise<EngineMoves> {
  const url = `${baseUrl.replace(/\/$/, "")}/evaluate`;
  const res = await fetch(url, {
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

export async function engineHealthCheck(baseUrl: string): Promise<void> {
  const url = `${baseUrl.replace(/\/$/, "")}/health`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`game-engine health ${res.status} at ${url}. Is docker compose up -d running with cubeless.onnx?`);
  }
}

export function createGameEngineDriver(baseUrl: string): MatchPlayer {
  return {
    ...infallibleCube(),
    async chooseChecker(pos, ctx) {
      const { moves } = await evaluateOnEngine(baseUrl, pos);
      const best = pickBestPlay(moves, pos, ctx.phase);
      if (!best) return { steps: [], cubeless: null };
      return { steps: best.steps, cubeless: best.cubeless };
    },
  };
}
