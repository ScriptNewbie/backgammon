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

/**
 * An engine's cube decision for the position with the doubler on roll and no dice
 * (`POST /cube` on game-engine and game-engine-fast, ADR 0032). MWCs are for the doubler.
 * `available` is false when `match` is null, the doubler may not double, or the cube is at 64:
 * then `offer` is "no-double" and `take` and the MWCs are null.
 */
export type CubeDecision = {
  available: boolean;
  offer: "double" | "no-double";
  take: "take" | "drop" | null;
  noDouble: number | null;
  doubleTake: number | null;
  doubleDrop: number | null;
  /** The doubler's cubeless probabilities the decision was made from. */
  cubeless: Cubeless;
};

export type Eval = {
  cubeless: Cubeless;
  cubefulEquity: number;
  /** Reserved. Teacher labels and both engines leave it null; engine cube decisions come from `/cube` (ADR 0032). */
  cubeAction: CubeActionFlag | null;
  /** `"bgweb-api"` is the teacher of dumps written before ADR 0031; new teacher labels are `"gnubg"`. */
  source: "gnubg" | "bgweb-api" | "hedgehog" | "model" | "heuristic" | "unknown";
};

/** One legal checker play with the eval of the resulting position (opponent is STM there). */
export type LegalPlay = {
  steps: Step[];
  eval: Eval;
  /** Teacher's cubeless equity gap to its best play, mover side (0 for the best, else negative). */
  teacherDiff: number;
};
