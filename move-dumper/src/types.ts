import type { Eval, Position, Step } from "ts-core";
import type { LegalPlay } from "ts-core";

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

export type DumpRecord = {
  v: 1;
  id: string;
  gameId: string;
  ply: number;
  decision: "checker";
  players: { p1: Level; p2: Level };
  chosen: { steps: Step[] };
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
    /** Teacher. Batches written before ADR 0031 say "bgweb-api" (its plies 1 = GnuBG 0-ply). */
    name: "gnubg";
    version: string;
    settings: {
      play: "game";
      baseUrl: string;
      cubefulLabels: true;
      /** GnuBG ply of the labels (the top plays' depth under `labelFilter: "gnubg"`). */
      ply: number;
      /** `gnubg`: GnuBG's own move filter (top plays at `ply`, the rest shallower). `all`: every play at `ply`. */
      labelFilter: "gnubg" | "all";
      seed: number;
      levels: Level[];
      pairingWeights: Record<string, number>;
      temperatures: Record<string, number>;
    };
  };
};
