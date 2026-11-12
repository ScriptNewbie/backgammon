import { applySteps } from "./board";
import { fetchWithRetry } from "./http";
import { flipStmCubeless, makeCubeless } from "./eval";
import { generateLegalPlays } from "./moves";
import type { Cubeless, LegalPlay, Player, Position, SearchPly, Step } from "./types";

/**
 * Wire encoding for the external Hedgehog getmoves server.
 * OGID is not a stored board representation. p1 is Black (bears off toward 1);
 * p2 is White (bears off toward 24). Field 5 names who reached the position,
 * so p1 on roll is `W` and p2 on roll is `B`.
 */

const PIP_CHAR = "0123456789abcdefghijklmnop";

export const HEDGEHOG_PLY_MAX = 2;
export const HEDGEHOG_TIMEOUT_MS = 180_000;
/** Sidecar wire version this client speaks (`/health` `api`). */
export const HEDGEHOG_API = 2;

export type HedgehogMoveJson = {
  ogid: string;
  win: number;
  gammon_win: number;
  bg_win: number;
  gammon_loss: number;
  bg_loss: number;
  /** Cubeless money equity, mover side. */
  equity?: number;
  /** Hedgehog's ranking key: EMG at the mover's score and cube, money equity in a money game. */
  match_equity?: number;
};

/** Hedgehog's own cube decision for the doubler on roll (docs/domain/hedgehog.md). */
export type HedgehogCubeAnalysis = {
  ogid: string;
  /** Engine wording, e.g. "No double", "Double, take". */
  action: string;
  offer: "double" | "no-double";
  take: "take" | "drop";
};

function pipChar(pip: number): string {
  const ch = PIP_CHAR[pip];
  if (ch === undefined) throw new Error(`invalid pip ${pip}`);
  return ch;
}

function charToPip(ch: string): number {
  if (ch === "q") return 26;
  const pip = PIP_CHAR.indexOf(ch);
  if (pip < 0) throw new Error(`invalid OGID checker ${ch}`);
  return pip;
}

function cubeExponent(value: number): number {
  const exp = Math.round(Math.log2(value));
  if (2 ** exp !== value || exp < 0 || exp > 6) {
    throw new Error(`cube value must be 1,2,4,8,16,32,64 (got ${value})`);
  }
  return exp;
}

function cubeField(position: Position): string {
  const exp = cubeExponent(position.cube.value);
  let owner: string;
  if (position.cube.value === 64) {
    owner = position.cube.owner === "p1" ? "B" : position.cube.owner === "p2" ? "W" : "N";
  } else if (!position.cube.mayDouble.p1 && !position.cube.mayDouble.p2) {
    owner = "D";
  } else if (position.cube.owner === "p1") {
    owner = "B";
  } else if (position.cube.owner === "p2") {
    owner = "W";
  } else {
    owner = "N";
  }
  return `${owner}${exp}N`;
}

function encodeCheckers(pips: number[]): string {
  const chars = pips.map(pipChar);
  chars.sort();
  return chars.join("");
}

/** Checker multiset, ignoring borne-off markers. Same key for a position and its OGID. */
export function checkerKey(position: Position): string {
  const points = position.points.map(String).join(",");
  return `${points}|${position.bar.p1},${position.bar.p2}|${position.off.p1},${position.off.p2}`;
}

export function checkerKeyFromOgid(ogid: string): string {
  const [whiteField, blackField] = ogid.split(":");
  if (whiteField === undefined || blackField === undefined) {
    throw new Error(`OGID is missing checker fields: ${ogid}`);
  }
  const white = new Array<number>(26).fill(0);
  const black = new Array<number>(26).fill(0);
  for (const ch of whiteField) {
    const pip = charToPip(ch);
    if (pip <= 25) white[pip] += 1;
  }
  for (const ch of blackField) {
    const pip = charToPip(ch);
    if (pip <= 25) black[pip] += 1;
  }
  const points: number[] = [];
  for (let n = 1; n <= 24; n++) {
    points.push((black[n] ?? 0) - (white[n] ?? 0));
  }
  const onWhite = white.reduce((sum, n) => sum + n, 0);
  const onBlack = black.reduce((sum, n) => sum + n, 0);
  const offP2 = 15 - onWhite;
  const offP1 = 15 - onBlack;
  return checkerKey({
    points,
    bar: { p1: black[25] ?? 0, p2: white[0] ?? 0 },
    off: { p1: offP1, p2: offP2 },
    onRoll: "p1",
    dice: null,
    cube: { value: 1, owner: "centered", mayDouble: { p1: false, p2: false } },
    match: null,
  });
}

export function positionToOgid(position: Position): string {
  if (position.points.length !== 24) throw new Error("position.points must have length 24");
  const white: number[] = [];
  const black: number[] = [];
  for (let n = 1; n <= 24; n++) {
    const v = position.points[n - 1]!;
    if (v > 0) for (let i = 0; i < v; i++) black.push(n);
    if (v < 0) for (let i = 0; i < -v; i++) white.push(n);
  }
  for (let i = 0; i < position.bar.p2; i++) white.push(0);
  for (let i = 0; i < position.bar.p1; i++) black.push(25);
  const dice = position.dice ? `${position.dice[0]}${position.dice[1]}` : "";
  const color = hedgehogOnRoll(position.onRoll);
  const state = position.dice ? "R" : "C";
  const scoreW = position.match?.score.p2 ?? 0;
  const scoreB = position.match?.score.p1 ?? 0;
  const matchLen = !position.match
    ? "0"
    : position.match.crawford
      ? `${position.match.length}C`
      : String(position.match.length);
  return [
    encodeCheckers(white),
    encodeCheckers(black),
    cubeField(position),
    dice,
    color,
    state,
    String(scoreW),
    String(scoreB),
    matchLen,
    "0",
  ].join(":");
}

export function clampPly(ply: number): SearchPly {
  if (ply !== 0 && ply !== 1) throw new Error(`ply must be 0 or 1 (got ${ply})`);
  return ply;
}

/** Pair sidecar successor boards with our legal steps. Evals are mover-perspective. */
export function joinHedgehogMoves(
  position: Position,
  moves: readonly HedgehogMoveJson[],
): { plays: LegalPlay[]; unmatched: number } {
  const ours = new Map<string, Step[]>();
  for (const steps of generateLegalPlays(position)) {
    ours.set(checkerKey(applySteps(position, steps)), steps);
  }
  if (ours.size === 0) {
    const unchanged =
      moves.length === 1 && checkerKeyFromOgid(moves[0]!.ogid) === checkerKey(position);
    if (moves.length === 0 || unchanged) return { plays: [], unmatched: 0 };
  }

  const plays: LegalPlay[] = [];
  const seen = new Set<string>();
  for (const move of moves) {
    const key = checkerKeyFromOgid(move.ogid);
    if (seen.has(key)) throw new Error("hedgehog returned two plays with the same board");
    seen.add(key);
    const steps = ours.get(key);
    if (!steps) {
      return { plays, unmatched: moves.length - plays.length };
    }
    const mover = makeCubeless({
      win: move.win,
      gammon: move.gammon_win,
      backgammon: move.bg_win,
      loseGammon: move.gammon_loss,
      loseBackgammon: move.bg_loss,
    });
    if (move.equity !== undefined) mover.equity = move.equity;
    plays.push({
      steps,
      teacherDiff: 0,
      eval: {
        cubeless: flipStmCubeless(mover),
        cubefulEquity: 0,
        cubeAction: null,
        source: "hedgehog",
      },
    });
  }
  if (plays.length !== ours.size) return { plays, unmatched: ours.size - plays.length };
  return { plays, unmatched: 0 };
}

/** The sidecar lists moves best first by `match_equity`. Anything else is an old or broken sidecar. */
export function assertHedgehogOrder(moves: readonly HedgehogMoveJson[]): void {
  for (let i = 0; i < moves.length; i++) {
    const key = moves[i]!.match_equity;
    if (typeof key !== "number" || !Number.isFinite(key)) {
      throw new Error("hedgehog move has no match_equity; rebuild the sidecar image (docs/domain/hedgehog.md)");
    }
    if (i > 0 && key > moves[i - 1]!.match_equity!) {
      throw new Error("hedgehog moves are not best first");
    }
  }
}

export function parseHedgehogCube(ogid: string, body: unknown): HedgehogCubeAnalysis {
  const parsed = body as { action?: unknown; offer?: unknown; take?: unknown };
  const offer = parsed.offer;
  const take = parsed.take;
  if (offer !== "double" && offer !== "no-double") throw new Error(`hedgehog cube offer is not recognised: ${String(offer)}`);
  if (take !== "take" && take !== "drop") throw new Error(`hedgehog cube take is not recognised: ${String(take)}`);
  return { ogid, action: typeof parsed.action === "string" ? parsed.action : "", offer, take };
}

export class HedgehogClient {
  model = "";
  private lastCube: HedgehogCubeAnalysis | null = null;

  constructor(
    readonly baseUrl: string,
    readonly ply: SearchPly = 1,
  ) {}

  /** Hedgehog's top play, as the engine ranks it at this cube and score. Not re-ranked. */
  async chooseChecker(position: Position): Promise<{ steps: Step[]; cubeless: Cubeless | null }> {
    const { plays } = await this.getMoves(position);
    const best = plays[0];
    if (!best) return { steps: [], cubeless: null };
    return { steps: best.steps, cubeless: best.eval.cubeless };
  }

  /** Hedgehog's cube decision with the doubler on roll: its offer, and the taker's answer. */
  async cubeAction(position: Position): Promise<HedgehogCubeAnalysis> {
    const ogid = positionToOgid({ ...position, dice: null });
    if (this.lastCube?.ogid === ogid) return this.lastCube;
    const analysis = parseHedgehogCube(ogid, await this.post("/v1/cube", { ogid, ply: this.ply }));
    this.lastCube = analysis;
    return analysis;
  }

  /** Every legal play with Hedgehog's evals, best first. */
  async getMoves(position: Position): Promise<{ plays: LegalPlay[]; plies: number }> {
    if (!position.dice) throw new Error("hedgehog getmoves requires dice");
    const body = await this.post("/v1/moves", {
      ogid: positionToOgid(position),
      ply: this.ply,
    });
    const parsed = body as { ply?: number; moves?: HedgehogMoveJson[] };
    const moves = parsed.moves;
    if (!Array.isArray(moves)) throw new Error("hedgehog response has no moves array");
    assertHedgehogOrder(moves);
    const joined = joinHedgehogMoves(position, moves);
    if (joined.unmatched !== 0) {
      const sample = moves
        .slice(0, 3)
        .map((move) => move.ogid)
        .join(" | ");
      throw new Error(
        `hedgehog legal plays did not match ours (theirs ${moves.length}, matched ${joined.plays.length}) at ${positionToOgid(position)}; successors: ${sample}`,
      );
    }
    return { plays: joined.plays, plies: parsed.ply ?? this.ply };
  }

  async healthCheck(): Promise<void> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/health`;
    const res = await fetchWithRetry(
      url,
      { method: "GET", headers: { accept: "application/json" } },
      { name: "hedgehog", timeoutMs: HEDGEHOG_TIMEOUT_MS },
    );
    const body = (await res.json()) as { ok?: boolean; model?: string; api?: number };
    if (!body.ok) throw new Error("hedgehog /health did not return ok");
    if (body.api !== HEDGEHOG_API) {
      throw new Error(
        `hedgehog sidecar speaks api ${body.api ?? 1}, this client needs ${HEDGEHOG_API}; rebuild the image (docs/domain/hedgehog.md)`,
      );
    }
    this.model = body.model ?? "";
  }

  private async post(path: string, payload: unknown): Promise<unknown> {
    const url = `${this.baseUrl.replace(/\/$/, "")}${path}`;
    const res = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
      { name: "hedgehog", timeoutMs: HEDGEHOG_TIMEOUT_MS },
    );
    return res.json();
  }
}

export function hedgehogOnRoll(onRoll: Player): "W" | "B" {
  return onRoll === "p1" ? "W" : "B";
}
