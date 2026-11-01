import type { Player, Position, SgfEvent, SgfGame, Step } from "ts-core";

export type { Player, Position, SgfEvent, SgfGame, Step };

export type ReplayEvent =
  | SgfEvent
  | { kind: "roll"; player: Player; dice: [number, number]; canMove: boolean };

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
