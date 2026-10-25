import type { Position } from "ts-core";
import type { LegalPlay } from "ts-core/bgweb";
import { infallibleCube, type MatchPlayer } from "ts-core/sim";
import { pickBestPlay } from "../rank";

type CheckerClient = {
  getMoves(pos: Position): Promise<{ plays: LegalPlay[] }>;
};

/** Max-strength checker driver for the teacher and Hedgehog clients. */
export function createCheckerDriver(client: CheckerClient): MatchPlayer {
  return {
    ...infallibleCube(),
    async chooseChecker(pos, ctx) {
      const { plays } = await client.getMoves(pos);
      const best = pickBestPlay(plays, pos, ctx.phase);
      if (!best) return { steps: [], cubeless: null };
      return { steps: best.steps, cubeless: best.cubeless };
    },
  };
}
