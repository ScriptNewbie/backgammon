import type { Level, MatchPhase, Player, Step } from "./types";

export type SgfEvent =
  | { kind: "move"; player: Player; dice: [number, number]; steps: Step[] }
  | { kind: "cube"; player: Player; action: "double" | "take" | "drop" };

export type SgfGame = {
  length: number;
  gameIndex: number;
  ws: number;
  bs: number;
  p1: Level;
  p2: Level;
  phase: MatchPhase;
  events: SgfEvent[];
  result: { winner: Player; points: number };
};

function pointLetter(point: number | "bar" | "off"): string {
  if (point === "bar") return "y";
  if (point === "off") return "z";
  return String.fromCharCode("a".charCodeAt(0) + point - 1);
}

export function encodeCheckerMove(dice: [number, number], steps: readonly Step[]): string {
  const body = steps.map((s) => pointLetter(s.from) + pointLetter(s.to)).join("");
  return `${dice[0]}${dice[1]}${body}`;
}

function color(player: Player): "W" | "B" {
  return player === "p1" ? "W" : "B";
}

function ru(phase: MatchPhase, length: number): string {
  if (phase === "crawford" || length === 1) return "RU[Crawford:CrawfordGame]";
  return "RU[Crawford]";
}

function gameTree(game: SgfGame): string {
  const reWinner = game.result.winner === "p1" ? "W" : "B";
  const nodes = game.events.map((ev) => {
    if (ev.kind === "cube") return `;${color(ev.player)}[${ev.action}]`;
    return `;${color(ev.player)}[${encodeCheckerMove(ev.dice, ev.steps)}]`;
  });
  return [
    `(;FF[4]GM[6]CA[UTF-8]AP[move-dumper:1]`,
    `MI[length:${game.length}][game:${game.gameIndex}][ws:${game.ws}][bs:${game.bs}]`,
    `PW[p1-${game.p1}]PB[p2-${game.p2}]`,
    ru(game.phase, game.length),
    `RE[${reWinner}+${game.result.points}]`,
    ...nodes,
    `)`,
  ].join("\n");
}

export function renderMatchSgf(games: readonly SgfGame[]): string {
  return games.map(gameTree).join("\n") + "\n";
}
