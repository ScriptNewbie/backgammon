export type Player = "p1" | "p2";

export type MatchPhase = "pre" | "crawford" | "post";

/** GnuBG checker depth. `0` is the static net. `1` is one opponent roll. */
export type SearchPly = 0 | 1;

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
  match: MatchInfo | null;
};

export type Cubeless = {
  equity: number;
  win: number;
  gammon: number;
  backgammon: number;
  loseGammon: number;
  loseBackgammon: number;
};

export type CubeActionFlag = {
  double: boolean;
  take: boolean;
};

export type Eval = {
  cubeless: Cubeless;
  cubefulEquity: number;
  cubeAction: CubeActionFlag | null;
  source: "bgweb-api" | "hedgehog" | "model" | "heuristic" | "unknown";
};
