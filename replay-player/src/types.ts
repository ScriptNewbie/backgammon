import type {
  Player,
  Position,
  Step,
} from "ts-core";

export type { Player, Position, Step };

export type SgfEvent =
  | { kind: "move"; player: Player; dice: [number, number]; steps: Step[] }
  | { kind: "cube"; player: Player; action: "double" | "take" | "drop" };

export type ReplayEvent =
  | SgfEvent
  | { kind: "roll"; player: Player; dice: [number, number]; canMove: boolean };

export type SgfGame = {
  length: number;
  gameIndex: number;
  ws: number;
  bs: number;
  p1: string;
  p2: string;
  phase: "pre" | "crawford" | "post";
  events: SgfEvent[];
  result: { winner: Player; points: number } | null;
};

export type Frame = {
  position: Position;
  lastEvent: ReplayEvent | null;
  gameIndex: number;
  eventIndex: number;
  caption: string;
  players: { p1: string; p2: string };
  result: { winner: Player; points: number } | null;
  usedDice: number[];
};
