import type { Cubeless, Position, Step } from "ts-core";
import type { XgCubeAnalysis } from "ts-core/xg";
import type { MatchPlayer } from "ts-core/sim";

type XgLike = {
  chooseChecker(pos: Position): Promise<{ steps: Step[]; cubeless: Cubeless }>;
  cubeAction(pos: Position): Promise<XgCubeAnalysis>;
};

/**
 * eXtreme Gammon 2 through the GUI sidecar (docs/domain/xg.md). Checker play is XG's top
 * play, not re-ranked. Offer and take are XG's own, from its cube analysis with the doubler
 * on roll.
 */
export function createXgDriver(client: XgLike): MatchPlayer {
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
