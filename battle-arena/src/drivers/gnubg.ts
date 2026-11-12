import type { Cubeless, Position, Step } from "ts-core";
import type { GnubgCubeAnalysis } from "ts-core/gnubg";
import type { MatchPlayer } from "ts-core/sim";

type GnubgLike = {
  chooseChecker(pos: Position): Promise<{ steps: Step[]; cubeless: Cubeless | null }>;
  cubeAction(pos: Position): Promise<GnubgCubeAnalysis>;
};

/**
 * GNU Backgammon through its command-line sidecar (docs/domain/gnubg.md, ADR 0031). Checker
 * play is gnubg's top play at this cube, score, and ply, with its own move filters, not
 * re-ranked. Offer and take are gnubg's cube analysis with the doubler on roll.
 */
export function createGnubgDriver(client: GnubgLike): MatchPlayer {
  return {
    async chooseChecker(pos) {
      return client.chooseChecker(pos);
    },
    async chooseOffer(pos) {
      return (await client.cubeAction(pos)).offer;
    },
    async chooseTake(pos) {
      const analysis = await client.cubeAction(pos);
      if (!analysis.take) throw new Error(`gnubg has no take decision here (${analysis.action})`);
      return analysis.take;
    },
  };
}
