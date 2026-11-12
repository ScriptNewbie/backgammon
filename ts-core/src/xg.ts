import { flipStmCubeless, makeCubeless } from "./eval";
import { MOVE_TOKEN, matchNotationPlay } from "./notation";
import type { Cubeless, Position, Step } from "./types";

/**
 * Wire encoding and text parsing for the eXtreme Gammon 2 GUI sidecar
 * (docs/domain/xg.md). XGID is representation 3: built here, sent once, never stored.
 * p1 is XG's bottom player (uppercase, bears off toward 1); the checker string does not
 * flip when p2 is on roll, the turn field does. XG writes analysis text from the
 * mover's side: "Player" is whoever is on roll, and points are mover-relative.
 */

export const XG_TIMEOUT_MS = 180_000;
const XG_QUERY_ATTEMPTS = 3;
/** Sidecar errors that mean "XG did not respond in time", not "XG disagrees". */
const XG_TRANSIENT = /did not answer|did not load|did not finish|fetch failed/;
const MAX_CUBE_EXP = 6;

export type XgQueryKind = "checker" | "cube";

export type XgProbs = { win: number; gammon: number; backgammon: number };

export type XgCheckerLine = {
  rank: number;
  level: string;
  notation: string;
  equity: number;
  player: XgProbs;
  opponent: XgProbs;
};

export type XgCheckerAnalysis = { xgid: string; moves: XgCheckerLine[] };

export type XgCubeAnalysis = {
  xgid: string;
  /** Raw "Best Cube action" text, e.g. "No double / Take". */
  action: string;
  offer: "double" | "no-double";
  take: "take" | "drop";
};

function cubeExponent(value: number): number {
  const exp = Math.round(Math.log2(value));
  if (2 ** exp !== value || exp < 0 || exp > MAX_CUBE_EXP) {
    throw new Error(`cube value must be 1,2,4,8,16,32,64 (got ${value})`);
  }
  return exp;
}

function checkerChar(count: number, upper: boolean): string {
  if (count === 0) return "-";
  if (count < 0 || count > 15) throw new Error(`invalid checker count ${count}`);
  const base = upper ? 65 : 97;
  return String.fromCharCode(base + count - 1);
}

/** XGID for a position. Dice null means "to roll or double" (`00`). */
export function positionToXgid(position: Position): string {
  if (position.points.length !== 24) throw new Error("position.points must have length 24");
  let board = checkerChar(position.bar.p2, false);
  for (const v of position.points) board += v >= 0 ? checkerChar(v, true) : checkerChar(-v, false);
  board += checkerChar(position.bar.p1, true);

  const exp = cubeExponent(position.cube.value);
  const owner = position.cube.owner === "p1" ? 1 : position.cube.owner === "p2" ? -1 : 0;
  const turn = position.onRoll === "p1" ? 1 : -1;
  const dice = position.dice ? `${position.dice[0]}${position.dice[1]}` : "00";
  const match = position.match;
  const crawford = match?.crawford ? 1 : 0;
  // XG has no dead-cube flag. Outside Crawford, a cube nobody may turn is capped at its value.
  const dead = !crawford && !position.cube.mayDouble.p1 && !position.cube.mayDouble.p2;
  const maxCube = dead ? exp : MAX_CUBE_EXP;
  return [
    `XGID=${board}`,
    exp,
    owner,
    turn,
    dice,
    match?.score.p1 ?? 0,
    match?.score.p2 ?? 0,
    crawford,
    match?.length ?? 0,
    maxCube,
  ].join(":");
}

function num(raw: string): number {
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) throw new Error(`XG number ${raw} is not a number`);
  return n;
}

function textXgid(text: string): string {
  const line = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^﻿/, "").trim())
    .find((l) => l.startsWith("XGID="));
  if (!line) throw new Error("XG text has no XGID line");
  return line;
}

const MOVE_LINE = /^\s*(\d+)\.\s+(.+?)\s+eq:\s*([+-]?\d+(?:[.,]\d+)?)/;
const PROB_LINE = /^\s*(Player|Opponent):\s+(\d+(?:[.,]\d+)?)%\s+\(G:(\d+(?:[.,]\d+)?)%\s+B:(\d+(?:[.,]\d+)?)%\)/;

function splitLevelAndMove(body: string): { level: string; notation: string } {
  const cannot = body.match(/^(.*?)\s*Cannot Move$/i);
  if (cannot) return { level: cannot[1]!.trim(), notation: "Cannot Move" };
  const tokens = body.trim().split(/\s+/);
  let first = tokens.length;
  while (first > 0 && MOVE_TOKEN.test(tokens[first - 1]!)) first -= 1;
  if (first === tokens.length || first === 0) {
    throw new Error(`XG move line is not recognised: ${body}`);
  }
  return { level: tokens.slice(0, first).join(" "), notation: tokens.slice(first).join(" ") };
}

/** Parse XG's "Position to Clipboard" text after Analyze → Position. */
export function parseXgCheckerText(text: string): XgCheckerAnalysis {
  const xgid = textXgid(text);
  const lines = text.split(/\r?\n/);
  const moves: XgCheckerLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]!.match(MOVE_LINE);
    if (!m) continue;
    const { level, notation } = splitLevelAndMove(m[2]!);
    const player = lines[i + 1]?.match(PROB_LINE);
    const opp = lines[i + 2]?.match(PROB_LINE);
    if (!player || player[1] !== "Player" || !opp || opp[1] !== "Opponent") {
      throw new Error(`XG move ${m[1]} has no Player / Opponent lines`);
    }
    const probs = (p: RegExpMatchArray): XgProbs => ({
      win: num(p[2]!) / 100,
      gammon: num(p[3]!) / 100,
      backgammon: num(p[4]!) / 100,
    });
    moves.push({
      rank: Number(m[1]),
      level,
      notation,
      equity: num(m[3]!),
      player: probs(player),
      opponent: probs(opp),
    });
    i += 2;
  }
  if (moves.length === 0) throw new Error("XG text has no analysed checker play");
  if (moves[0]!.rank !== 1) throw new Error("XG text does not start at move 1");
  return { xgid, moves };
}

const OFFER: Record<string, "double" | "no-double"> = {
  "no double": "no-double",
  "no redouble": "no-double",
  double: "double",
  redouble: "double",
  "too good to double": "no-double",
  "too good to redouble": "no-double",
};

const TAKE: Record<string, "take" | "drop"> = {
  take: "take",
  pass: "drop",
};

/** Parse XG's "Position to Clipboard" text after Analyze → Double Action. */
export function parseXgCubeText(text: string): XgCubeAnalysis {
  const xgid = textXgid(text);
  const line = text.split(/\r?\n/).find((l) => /^\s*Best Cube action:/.test(l));
  if (!line) throw new Error("XG text has no Best Cube action line");
  const action = line.replace(/^\s*Best Cube action:\s*/, "").trim();
  const parts = action.split("/").map((p) => p.trim().toLowerCase());
  const offer = parts.length === 2 ? OFFER[parts[0]!] : undefined;
  const take = parts.length === 2 ? TAKE[parts[1]!] : undefined;
  if (!offer || !take) throw new Error(`XG cube action is not recognised: ${action}`);
  return { xgid, action, offer, take };
}

/**
 * Our legal play that XG's notation names. Plays that leave the same board collapse to
 * the smallest `stepsKey`. Anything that is not one of our legal plays throws.
 */
export function matchXgPlay(position: Position, notation: string): Step[] {
  return matchNotationPlay(position, notation, "XG");
}

/** Cubeless after the play, flipped to the player about to move. */
export function xgResultCubeless(line: XgCheckerLine): Cubeless {
  const total = line.player.win + line.opponent.win;
  if (Math.abs(total - 1) > 0.001) {
    throw new Error(`XG win chances do not add to 100% (${(total * 100).toFixed(2)}%)`);
  }
  const mover = makeCubeless({
    win: line.player.win,
    gammon: line.player.gammon,
    backgammon: line.player.backgammon,
    loseGammon: line.opponent.gammon,
    loseBackgammon: line.opponent.backgammon,
  });
  return flipStmCubeless(mover);
}

export class XgClient {
  version = "";
  private lastCube: { xgid: string; analysis: XgCubeAnalysis } | null = null;

  constructor(
    readonly baseUrl: string,
    readonly retryDelayMs = 3000,
  ) {}

  async chooseChecker(position: Position): Promise<{ steps: Step[]; cubeless: Cubeless }> {
    if (!position.dice) throw new Error("XG checker query requires dice");
    const xgid = positionToXgid(position);
    const analysis = parseXgCheckerText(await this.query(xgid, "checker"));
    if (analysis.xgid !== xgid) throw new Error(`XG analysed ${analysis.xgid}, asked ${xgid}`);
    const best = analysis.moves[0]!;
    return { steps: matchXgPlay(position, best.notation), cubeless: xgResultCubeless(best) };
  }

  /** XG's cube analysis for the doubler on roll: offer from the first half, take from the second. */
  async cubeAction(position: Position): Promise<XgCubeAnalysis> {
    const pos = { ...position, dice: null };
    const xgid = positionToXgid(pos);
    if (this.lastCube?.xgid === xgid) return this.lastCube.analysis;
    const analysis = parseXgCubeText(await this.query(xgid, "cube"));
    if (analysis.xgid !== xgid) throw new Error(`XG analysed ${analysis.xgid}, asked ${xgid}`);
    this.lastCube = { xgid, analysis };
    return analysis;
  }

  async healthCheck(): Promise<void> {
    let res: Response;
    try {
      res = await fetch(this.url("/health"), {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`xg sidecar unreachable at ${this.baseUrl} (${reason})`);
    }
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; version?: string; error?: string };
    if (!res.ok || !body.ok) throw new Error(`xg /health is not ok: ${body.error ?? res.status}`);
    this.version = body.version ?? "";
  }

  /** GUI hiccups (XG busy, import not taken) are retried; anything else fails at once. */
  private async query(xgid: string, kind: XgQueryKind): Promise<string> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.queryOnce(xgid, kind);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (attempt >= XG_QUERY_ATTEMPTS || !XG_TRANSIENT.test(message)) throw err;
        console.error(`${message}; retry ${attempt}/${XG_QUERY_ATTEMPTS - 1}`);
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
      }
    }
  }

  private async queryOnce(xgid: string, kind: XgQueryKind): Promise<string> {
    const res = await fetch(this.url("/v1/query"), {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ xgid, kind }),
      signal: AbortSignal.timeout(XG_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; text?: string; error?: string };
    if (!res.ok || !body.ok || typeof body.text !== "string") {
      throw new Error(`xg sidecar ${kind} ${xgid} failed (${res.status}): ${body.error ?? "no text"}`);
    }
    return body.text;
  }

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/$/, "")}${path}`;
  }
}
