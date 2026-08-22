import type { MatchPhase, Player } from "./types";
import { encodeCheckerMove, type SgfEvent, type SgfGame } from "./sgf-codec";

export {
  decodePoint,
  encodeCheckerMove,
  encodePoint,
  parseCheckerMove,
} from "./sgf-codec";
export type { SgfEvent, SgfGame } from "./sgf-codec";

function color(player: Player): "W" | "B" {
  return player === "p1" ? "W" : "B";
}

function ru(phase: MatchPhase, length: number): string {
  if (phase === "crawford" || length === 1) return "RU[Crawford:CrawfordGame]";
  return "RU[Crawford]";
}

function resultProp(result: SgfGame["result"]): string {
  if (!result) return "RE[0]";
  const winner = result.winner === "p1" ? "W" : "B";
  return `RE[${winner}+${result.points}]`;
}

function gameTree(game: SgfGame, app: string): string {
  const nodes = game.events.map((ev: SgfEvent) => {
    if (ev.kind === "cube") return `;${color(ev.player)}[${ev.action}]`;
    return `;${color(ev.player)}[${encodeCheckerMove(ev.dice, ev.steps)}]`;
  });
  return [
    `(;FF[4]GM[6]CA[UTF-8]AP[${app}]`,
    `MI[length:${game.length}][game:${game.gameIndex}][ws:${game.ws}][bs:${game.bs}]`,
    `PW[p1-${game.p1}]PB[p2-${game.p2}]`,
    ru(game.phase, game.length),
    resultProp(game.result),
    ...nodes,
    `)`,
  ].join("\n");
}

export function renderMatchSgf(games: readonly SgfGame[], opts: { app?: string } = {}): string {
  const app = opts.app ?? "move-dumper:1";
  return games.map((game) => gameTree(game, app)).join("\n") + "\n";
}
