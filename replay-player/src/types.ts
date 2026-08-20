export type Player = "p1" | "p2";

export type Point = number | "bar" | "off";

export type Step = {
  from: number | "bar";
  to: number | "off";
};

export type Cube = {
  value: number;
  owner: "centered" | Player;
  mayDouble: { p1: boolean; p2: boolean };
};

export type MatchInfo = {
  length: number;
  score: { p1: number; p2: number };
  crawford: boolean;
};

export type Position = {
  points: number[];
  bar: { p1: number; p2: number };
  off: { p1: number; p2: number };
  onRoll: Player;
  dice: [number, number] | null;
  cube: Cube;
  match: MatchInfo;
};

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
