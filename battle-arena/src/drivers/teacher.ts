import { BgwebClient } from "ts-core/bgweb";
import { infallibleCube, type MatchPlayer } from "ts-core/sim";
import { pickBestPlay } from "../rank";

export function createTeacherDriver(client: BgwebClient): MatchPlayer {
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
