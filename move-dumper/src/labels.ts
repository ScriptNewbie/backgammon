import { makeCubeless, type Cubeless, type LegalPlay } from "ts-core";

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}

/**
 * Teacher probabilities made consistent (docs/domain/move-dumper.md): every one of the six
 * exclusive outcomes (single, gammon, backgammon win or loss) is non-negative, so
 * `0 <= backgammon <= gammon <= win` and `0 <= loseBackgammon <= loseGammon <= 1 - win`.
 * gnubg rounds each printed probability on its own, which can break that by about 1e-6
 * (ADR 0036). Equity is recomputed from the clamped values.
 */
export function consistentCubeless(c: Cubeless): Cubeless {
  const win = clamp(c.win, 0, 1);
  const gammon = clamp(c.gammon, 0, win);
  const loseGammon = clamp(c.loseGammon, 0, 1 - win);
  return makeCubeless({
    win,
    gammon,
    backgammon: clamp(c.backgammon, 0, gammon),
    loseGammon,
    loseBackgammon: clamp(c.loseBackgammon, 0, loseGammon),
  });
}

export function consistentPlays(plays: readonly LegalPlay[]): LegalPlay[] {
  return plays.map((p) => ({ ...p, eval: { ...p.eval, cubeless: consistentCubeless(p.eval.cubeless) } }));
}
