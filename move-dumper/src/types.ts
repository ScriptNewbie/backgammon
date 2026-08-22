import type { Eval, Position, Step } from "ts-core";
import type { LegalPlay } from "ts-core/bgweb";

export type {
  Cube,
  Cubeless,
  Eval,
  MatchInfo,
  MatchPhase,
  Player,
  Point,
  Position,
  Step,
} from "ts-core";

export type { LegalPlay };

export type Level = "noob" | "beginner" | "midwit" | "genius" | "infallible";

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
