import type { MatchPhase, Player, Step } from "./types";

export type SgfEvent =
  | { kind: "move"; player: Player; dice: [number, number]; steps: Step[] }
  | { kind: "cube"; player: Player; action: "double" | "take" | "drop" };

export type SgfGame = {
  length: number;
  gameIndex: number;
  ws: number;
  bs: number;
  p1: string;
  p2: string;
  phase: MatchPhase;
  events: SgfEvent[];
  result: { winner: Player; points: number } | null;
};

export function encodePoint(point: number | "bar" | "off"): string {
  if (point === "bar") return "y";
  if (point === "off") return "z";
  return String.fromCharCode("a".charCodeAt(0) + point - 1);
}

export function decodePoint(ch: string): number | "bar" | "off" {
  if (ch === "y") return "bar";
  if (ch === "z") return "off";
  if (ch.length !== 1) throw new Error(`SGF point ${ch}`);
  const n = ch.charCodeAt(0) - "a".charCodeAt(0) + 1;
  if (n < 1 || n > 24) throw new Error(`SGF point ${ch}`);
  return n;
}

export function encodeCheckerMove(dice: [number, number], steps: readonly Step[]): string {
  const body = steps.map((s) => encodePoint(s.from) + encodePoint(s.to)).join("");
  return `${dice[0]}${dice[1]}${body}`;
}

export function parseCheckerMove(raw: string): { dice: [number, number]; steps: Step[] } {
  if (!/^[1-6][1-6]/.test(raw)) {
    throw new Error(`SGF checker move ${raw}`);
  }
  const dice: [number, number] = [Number(raw[0]), Number(raw[1])];
  const body = raw.slice(2);
  if (body.length % 2 !== 0) throw new Error(`SGF checker body ${raw}`);
  const steps: Step[] = [];
  for (let i = 0; i < body.length; i += 2) {
    const from = decodePoint(body[i]!);
    const to = decodePoint(body[i + 1]!);
    if (from === "off") throw new Error(`SGF from off in ${raw}`);
    if (to === "bar") throw new Error(`SGF to bar in ${raw}`);
    steps.push({ from, to });
  }
  return { dice, steps };
}
