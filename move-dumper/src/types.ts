export type Player = "p1" | "p2";

export type Level = "noob" | "beginner" | "midwit" | "genius" | "infallible";

export type MatchPhase = "pre" | "crawford" | "post";

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

export type Cubeless = {
  equity: number;
  win: number;
  gammon: number;
  backgammon: number;
  loseGammon: number;
  loseBackgammon: number;
};

export type Eval = {
  cubeless: Cubeless;
  cubefulEquity: number;
  cubeAction: null;
  source: "bgweb-api" | "model" | "heuristic" | "unknown";
};

export type LegalPlay = {
  steps: Step[];
  eval: Eval;
  teacherDiff: number;
};

export type CubeAction = "no-double" | "double" | "take" | "drop";

export type DumpRecord = {
  v: 1;
  id: string;
  matchId: string;
  gameId: string;
  ply: number;
  decision: "checker" | "cube";
  players: { p1: Level; p2: Level };
  chosen: { steps: Step[] } | { action: CubeAction };
  position: Position;
  eval: null;
  moves: { steps: Step[]; eval: Eval }[];
  xgid: null;
};

export type Manifest = {
  v: 1;
  batchId: string;
  createdAt: string;
  recordsFile: "records.jsonl.gz";
  recordCount: number;
  engine: {
    name: "bgweb-api";
    version: string;
    settings: {
      play: "match";
      matchLengths: number[];
      baseUrl: string;
      cubefulLabels: true;
      plies?: number;
      seed: number;
      met: "kazaross-xg2";
      levels: Level[];
      pairingWeights: Record<string, number>;
      temperatures: Record<string, number>;
    };
  };
};
