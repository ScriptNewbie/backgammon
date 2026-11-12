import type { Cubeless, Position, Step } from "ts-core";
import type { HedgehogCubeAnalysis } from "ts-core/hedgehog";
import type { MatchPlayer } from "ts-core/sim";

type HedgehogLike = {
  chooseChecker(pos: Position): Promise<{ steps: Step[]; cubeless: Cubeless | null }>;
  cubeAction(pos: Position): Promise<HedgehogCubeAnalysis>;
};

/**
 * The Hedgehog engine through its sidecar (docs/domain/hedgehog.md, ADR 0030). Checker play
 * is Hedgehog's top play at this cube and score, not re-ranked by our MWC. Offer and take are
 * Hedgehog's own cube decision with the doubler on roll; `cubeEval.infallible*` is ignored on
 * this side only.
 */
export function createHedgehogDriver(client: HedgehogLike): MatchPlayer {
  return {
    async chooseChecker(pos) {
      return client.chooseChecker(pos);
    },
    async chooseOffer(pos) {
      return (await client.cubeAction(pos)).offer;
    },
    async chooseTake(pos) {
      return (await client.cubeAction(pos)).take;
    },
  };
}
