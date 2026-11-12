import { stepsKey } from "./board";
import { makeCubeless } from "./eval";
import { fetchWithRetry } from "./http";
import { generateLegalPlays } from "./moves";
import { legalPlaysByBoard, matchNotationPlay } from "./notation";
import type { Cubeless, LegalPlay, Position, Step } from "./types";
import { positionToXgid } from "./xg";

/**
 * Client for the GNU Backgammon command-line sidecar (docs/domain/gnubg.md, ADR 0031).
 * XGID is the wire (representation 3: built here, never stored). The sidecar returns
 * gnubg's own `hint` text, parsed here. gnubg writes moves and probabilities from the
 * side on roll.
 */

/** Sidecar wire version this client speaks (`/health` `api`). */
export const GNUBG_API = 1;
/** Highest GnuBG ply the sidecar accepts. */
export const GNUBG_MAX_PLY = 4;
export const GNUBG_TIMEOUT_MS = 600_000;

export type GnubgQueryKind = "checker" | "cube";
/** `gnubg`: GnuBG's own move filters (how it plays). `all`: every play searched at `ply` (labels). */
export type GnubgFilter = "gnubg" | "all";

/** Mover-side probabilities as gnubg prints them: win, gammon, backgammon - lose, gammon, backgammon. */
export type GnubgProbs = {
  win: number;
  gammon: number;
  backgammon: number;
  lose: number;
  loseGammon: number;
  loseBackgammon: number;
};

export type GnubgCheckerLine = {
  rank: number;
  cubeful: boolean;
  ply: number;
  notation: string;
  /** Mover equity: money points, or EMG at a match score. Cubeful when `cubeful`. */
  equity: number;
  probs: GnubgProbs;
};

export type GnubgCubeAnalysis = {
  xgid: string;
  /** gnubg wording, e.g. "No double, take", or "You cannot double". */
  action: string;
  offer: "double" | "no-double";
  /** The taker's answer to a double, from the doubler's analysis. Null when no double is possible. */
  take: "take" | "drop" | null;
};

const MOVE_LINE =
  /^\s*(\d+)\.\s+(Cubeful|Cubeless)\s+(\d+)-ply\s+(.+?)\s+Eq\.:\s*([+-]?\d+(?:\.\d+)?)(?:\s+\(([+-]?\d+(?:\.\d+)?)\))?\s*$/;
// gnubg prints "-0.000000" for an exact zero in decided positions.
const NUM = String.raw`(-?\d+(?:\.\d+)?)`;
const PROB_LINE = new RegExp(String.raw`^\s*${NUM}\s+${NUM}\s+${NUM}\s+-\s+${NUM}\s+${NUM}\s+${NUM}\s*$`);

function prob(raw: string): number {
  const n = Number(raw);
  return n === 0 ? 0 : n;
}

/** Parse gnubg `hint` output for a position with dice. A dance is an empty list. */
export function parseGnubgHint(text: string): GnubgCheckerLine[] {
  if (/^There are no legal moves\./m.test(text)) return [];
  const lines = text.split(/\r?\n/);
  const moves: GnubgCheckerLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(MOVE_LINE);
    if (!m) continue;
    const p = lines[i + 1]?.match(PROB_LINE);
    if (!p) throw new Error(`gnubg move ${m[1]} has no probability line`);
    moves.push({
      rank: Number(m[1]),
      cubeful: m[2] === "Cubeful",
      ply: Number(m[3]),
      notation: m[4]!.trim(),
      equity: Number(m[5]),
      probs: {
        win: prob(p[1]!),
        gammon: prob(p[2]!),
        backgammon: prob(p[3]!),
        lose: prob(p[4]!),
        loseGammon: prob(p[5]!),
        loseBackgammon: prob(p[6]!),
      },
    });
    i += 1;
  }
  if (moves.length === 0) throw new Error("gnubg text has no analysed checker play");
  moves.forEach((move, i) => {
    if (move.rank !== i + 1) throw new Error(`gnubg moves are not ranked 1..n (got ${move.rank} at ${i + 1})`);
  });
  return moves;
}

const OFFER: Record<string, "double" | "no-double"> = {
  "no double": "no-double",
  "no redouble": "no-double",
  double: "double",
  redouble: "double",
  "too good to double": "no-double",
  "too good to redouble": "no-double",
  // Doubling and playing on are worth the same to gnubg; it names the double, so we take it.
  "optional double": "double",
  "optional redouble": "double",
};

const TAKE: Record<string, "take" | "drop"> = {
  take: "take",
  pass: "drop",
  // Beavers are off on every query; a beaver is still a take.
  beaver: "take",
};

/** Parse gnubg `hint` output for a position without dice (the doubler on roll). */
export function parseGnubgCube(xgid: string, text: string): GnubgCubeAnalysis {
  if (/^You cannot double\./m.test(text)) {
    return { xgid, action: "You cannot double", offer: "no-double", take: null };
  }
  const line = text.split(/\r?\n/).find((l) => /^\s*Proper cube action:/.test(l));
  if (!line) throw new Error("gnubg text has no Proper cube action line");
  const action = line
    .replace(/^\s*Proper cube action:\s*/, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
  const parts = action.split(",").map((p) => p.trim().toLowerCase());
  const offer = parts.length === 2 ? OFFER[parts[0]!] : undefined;
  const take = parts.length === 2 ? TAKE[parts[1]!] : undefined;
  if (!offer || !take) throw new Error(`gnubg cube action is not recognised: ${action}`);
  return { xgid, action, offer, take };
}

function moverCubeless(probs: GnubgProbs): Cubeless {
  return makeCubeless({
    win: probs.win,
    gammon: probs.gammon,
    backgammon: probs.backgammon,
    loseGammon: probs.loseGammon,
    loseBackgammon: probs.loseBackgammon,
  });
}

/** Cubeless after the play, for the player about to move (the mover's probabilities flipped). */
export function gnubgResultCubeless(probs: GnubgProbs): Cubeless {
  return makeCubeless({
    win: probs.lose,
    gammon: probs.loseGammon,
    backgammon: probs.loseBackgammon,
    loseGammon: probs.gammon,
    loseBackgammon: probs.backgammon,
  });
}

function isTerminal(probs: GnubgProbs): boolean {
  return probs.win === 0 || probs.win === 1;
}

/**
 * Teacher labels from `hint` lines: one `LegalPlay` per legal board, in gnubg's order. With
 * filter `all` every play must be searched at `ply`; with `gnubg` (its own move filter, how
 * bgweb-api labelled) its top candidates are at `ply` and the rest shallower. `cubeless` and `teacherDiff` are money cubeless; `cubefulEquity` is
 * gnubg's money cubeful equity, both flipped to the side to move after the play.
 */
export function gnubgLabels(
  position: Position,
  lines: readonly GnubgCheckerLine[],
  ply: number,
  filter: GnubgFilter = "all",
): LegalPlay[] {
  const legal = legalPlaysByBoard(position);
  const seen = new Set<string>();
  const scored = lines.map((line) => {
    if (!line.cubeful) throw new Error(`gnubg move ${line.rank} is not cubeful`);
    // gnubg reports a finished game, and a forced play (nothing to choose), at its own depth.
    const tooDeep = line.ply > ply;
    const forced = lines.length === 1;
    const tooShallow = filter === "all" && line.ply < ply && !isTerminal(line.probs) && !forced;
    if (tooDeep || tooShallow) {
      throw new Error(`gnubg move ${line.rank} (${line.notation}) was searched at ${line.ply}-ply, not ${ply}-ply`);
    }
    const steps = matchNotationPlay(position, line.notation, "gnubg", legal);
    const key = stepsKey(steps);
    if (seen.has(key)) throw new Error(`gnubg listed ${line.notation} twice`);
    seen.add(key);
    return { line, steps, moverEq: moverCubeless(line.probs).equity };
  });
  if (seen.size !== legal.size) {
    throw new Error(`gnubg listed ${seen.size} plays; we have ${legal.size} legal boards`);
  }
  const best = Math.max(...scored.map((s) => s.moverEq));
  return scored.map(({ line, steps, moverEq }) => ({
    steps,
    teacherDiff: moverEq - best,
    eval: {
      cubeless: gnubgResultCubeless(line.probs),
      cubefulEquity: -line.equity,
      cubeAction: null,
      source: "gnubg",
    },
  }));
}

export class GnubgClient {
  version = "";
  private lastCube: GnubgCubeAnalysis | null = null;

  constructor(
    readonly baseUrl: string,
    readonly ply = 0,
    /** Move filter for `getMoves` labels. `chooseChecker` always uses gnubg's own. */
    readonly labelFilter: GnubgFilter = "gnubg",
  ) {
    if (!Number.isInteger(ply) || ply < 0 || ply > GNUBG_MAX_PLY) {
      throw new Error(`gnubg ply must be an integer 0-${GNUBG_MAX_PLY} (got ${ply})`);
    }
  }

  /**
   * Teacher labels (move-dumper): every legal play at `ply` under `labelFilter`, valued as a
   * money game with a centered live cube whatever the position's cube and match say. bgweb-api
   * labelled the same way at 2-ply with gnubg's filter before ADR 0031.
   */
  async getMoves(position: Position): Promise<{ plays: LegalPlay[]; ply: number }> {
    if (!position.dice) throw new Error("gnubg getMoves requires dice");
    if (generateLegalPlays(position).length === 0) return { plays: [], ply: this.ply };
    const labelled: Position = {
      ...position,
      cube: { value: 1, owner: "centered", mayDouble: { p1: true, p2: true } },
      match: null,
    };
    const text = await this.query(positionToXgid(labelled), "checker", this.labelFilter);
    return { plays: gnubgLabels(position, parseGnubgHint(text), this.ply, this.labelFilter), ply: this.ply };
  }

  /** gnubg's own play at this cube, score, and Crawford state, with its move filters. Not re-ranked. */
  async chooseChecker(position: Position): Promise<{ steps: Step[]; cubeless: Cubeless | null }> {
    if (!position.dice) throw new Error("gnubg checker query requires dice");
    if (generateLegalPlays(position).length === 0) return { steps: [], cubeless: null };
    const text = await this.query(positionToXgid(position), "checker", "gnubg");
    const best = parseGnubgHint(text)[0];
    if (!best) throw new Error("gnubg found no play where we have legal plays");
    return { steps: matchNotationPlay(position, best.notation, "gnubg"), cubeless: gnubgResultCubeless(best.probs) };
  }

  /** gnubg's cube decision with the doubler on roll: its offer, and the taker's answer. */
  async cubeAction(position: Position): Promise<GnubgCubeAnalysis> {
    const xgid = positionToXgid({ ...position, dice: null });
    if (this.lastCube?.xgid === xgid) return this.lastCube;
    const analysis = parseGnubgCube(xgid, await this.query(xgid, "cube", "gnubg"));
    this.lastCube = analysis;
    return analysis;
  }

  async healthCheck(): Promise<void> {
    let res: Response;
    try {
      res = await fetch(this.url("/health"), {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`gnubg sidecar unreachable at ${this.baseUrl} (${reason})`);
    }
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; version?: string; api?: number; error?: string };
    if (!res.ok || !body.ok) throw new Error(`gnubg /health is not ok: ${body.error ?? res.status}`);
    if (body.api !== GNUBG_API) {
      throw new Error(`gnubg sidecar speaks api ${body.api ?? "?"}, this client needs ${GNUBG_API}; rebuild it (docker compose build gnubg)`);
    }
    this.version = body.version ?? "";
  }

  private async query(xgid: string, kind: GnubgQueryKind, filter: GnubgFilter): Promise<string> {
    const res = await fetchWithRetry(
      this.url("/v1/query"),
      {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ xgid, kind, ply: this.ply, filter }),
      },
      { name: "gnubg", hint: "Keep docker compose up -d (gnubg service).", timeoutMs: GNUBG_TIMEOUT_MS },
    );
    const body = (await res.json()) as { ok?: boolean; text?: string; error?: string };
    if (!body.ok || typeof body.text !== "string") throw new Error(`gnubg ${kind} ${xgid} failed: ${body.error ?? "no text"}`);
    return body.text;
  }

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/$/, "")}${path}`;
  }
}
