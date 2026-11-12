import { applySteps, stepsKey } from "./board";
import { generateLegalPlays } from "./moves";
import type { Player, Position, Step } from "./types";

/**
 * Standard checker-move notation as eXtreme Gammon and GNU Backgammon print it, mover-relative:
 * `8/5 6/5`, `bar/22`, `6/off`, `13/7*`, `24/23*\/16`, `13/7(2)`. Not stored; only matched
 * back onto our legal plays.
 */
export const MOVE_TOKEN = /^(?:bar|\d{1,2})(?:\/(?:\d{1,2}|off)\*?)+(?:\(\d\))?$/i;

function absolutePoint(player: Player, raw: string, engine: string): number | "bar" | "off" {
  const lower = raw.toLowerCase();
  if (lower === "bar") return "bar";
  if (lower === "off") return "off";
  const n = Number(lower);
  if (!Number.isInteger(n) || n < 1 || n > 24) throw new Error(`${engine} point ${raw} is out of range`);
  return player === "p1" ? n : 25 - n;
}

type Segment = { from: number; steps: Step[] };

/**
 * Steps that reproduce the notation on our board. Not die-accurate: a chain without a hit
 * mark jumps straight to its end, which leaves the same board as the real path.
 */
function notationSteps(position: Position, notation: string, engine: string): Step[] {
  const player = position.onRoll;
  const segments: Segment[] = [];
  for (const token of notation.trim().split(/\s+/)) {
    if (!MOVE_TOKEN.test(token)) throw new Error(`${engine} move token is not recognised: ${token}`);
    const countMatch = token.match(/\((\d)\)$/);
    const count = countMatch ? Number(countMatch[1]) : 1;
    const parts = token.replace(/\(\d\)$/, "").split("/");
    const start = absolutePoint(player, parts[0]!, engine);
    if (start === "off") throw new Error(`${engine} move cannot start off: ${token}`);
    const path: Step[] = [];
    let at: number | "bar" = start;
    for (let i = 1; i < parts.length; i++) {
      const hit = parts[i]!.endsWith("*");
      const to = absolutePoint(player, parts[i]!.replace("*", ""), engine);
      if (to === "bar") throw new Error(`${engine} move cannot end on the bar: ${token}`);
      const last = i === parts.length - 1;
      if (!hit && !last) continue;
      path.push({ from: at, to });
      if (to === "off") {
        if (!last) throw new Error(`${engine} move continues after bearing off: ${token}`);
        break;
      }
      at = to;
    }
    const moverFrom = parts[0]!.toLowerCase() === "bar" ? 25 : Number(parts[0]);
    for (let k = 0; k < count; k++) segments.push({ from: moverFrom, steps: path });
  }
  segments.sort((a, b) => b.from - a.from);
  return segments.flatMap((s) => s.steps);
}

export function boardKey(position: Position): string {
  return `${position.points.join(",")}|${position.bar.p1},${position.bar.p2}|${position.off.p1},${position.off.p2}`;
}

/** Our legal plays keyed by the board they leave; plays that leave the same board keep the smallest `stepsKey`. */
export function legalPlaysByBoard(position: Position): Map<string, Step[]> {
  const byBoard = new Map<string, Step[]>();
  for (const steps of generateLegalPlays(position)) {
    const key = boardKey(applySteps(position, steps));
    const prev = byBoard.get(key);
    if (!prev || stepsKey(steps) < stepsKey(prev)) byBoard.set(key, steps);
  }
  return byBoard;
}

/**
 * Our legal play that the notation names. Plays that leave the same board collapse to the
 * smallest `stepsKey`. Anything that is not one of our legal plays throws. `Cannot Move`
 * (XG's wording for a dance) is the empty play. Pass `legal` from `legalPlaysByBoard` when
 * matching many lines for one position.
 */
export function matchNotationPlay(
  position: Position,
  notation: string,
  engine: string,
  legal: Map<string, Step[]> = legalPlaysByBoard(position),
): Step[] {
  if (/^cannot move$/i.test(notation.trim())) {
    if (legal.size !== 0) throw new Error(`${engine} says Cannot Move but we have ${legal.size} legal plays`);
    return [];
  }
  if (legal.size === 0) throw new Error(`${engine} played ${notation} where we have no legal play`);
  let target: string;
  try {
    target = boardKey(applySteps(position, notationSteps(position, notation, engine)));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${engine} play ${notation} does not apply to our board: ${message}`);
  }
  const best = legal.get(target);
  if (!best) throw new Error(`${engine} play ${notation} is not one of our legal plays`);
  return best;
}
