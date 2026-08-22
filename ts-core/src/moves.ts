import type { Player, Position, Step } from "./types";
import { applySteps, opponent, stepsKey } from "./board";

function occupancy(position: Position, player: Player, point: number): number {
  const v = position.points[point - 1]!;
  return player === "p1" ? Math.max(v, 0) : Math.max(-v, 0);
}

function isBlocked(position: Position, player: Player, point: number): boolean {
  return occupancy(position, opponent(player), point) >= 2;
}

function enterPoint(player: Player, die: number): number {
  return player === "p1" ? 25 - die : die;
}

function inHome(player: Player, point: number): boolean {
  return player === "p1" ? point >= 1 && point <= 6 : point >= 19 && point <= 24;
}

function allInHome(position: Position, player: Player): boolean {
  if (position.bar[player] > 0) return false;
  for (let p = 1; p <= 24; p++) {
    if (occupancy(position, player, p) > 0 && !inHome(player, p)) return false;
  }
  return true;
}

function bearOffDistance(player: Player, from: number): number {
  return player === "p1" ? from : 25 - from;
}

function furthestHomeDistance(position: Position, player: Player): number {
  let max = 0;
  for (let p = 1; p <= 24; p++) {
    if (occupancy(position, player, p) > 0 && inHome(player, p)) {
      max = Math.max(max, bearOffDistance(player, p));
    }
  }
  return max;
}

function destPoint(player: Player, from: number, die: number): number {
  return player === "p1" ? from - die : from + die;
}

function onBoard(point: number): boolean {
  return point >= 1 && point <= 24;
}

function possibleSteps(position: Position, die: number): Step[] {
  const player = position.onRoll;
  const steps: Step[] = [];
  if (position.bar[player] > 0) {
    const to = enterPoint(player, die);
    if (onBoard(to) && !isBlocked(position, player, to)) {
      steps.push({ from: "bar", to });
    }
    return steps;
  }

  const canOff = allInHome(position, player);
  const furthest = canOff ? furthestHomeDistance(position, player) : 0;

  for (let from = 1; from <= 24; from++) {
    if (occupancy(position, player, from) < 1) continue;
    const dest = destPoint(player, from, die);
    if (onBoard(dest)) {
      if (!isBlocked(position, player, dest)) steps.push({ from, to: dest });
      continue;
    }
    if (!canOff) continue;
    const dist = bearOffDistance(player, from);
    if (dist === die || (die > dist && dist === furthest)) {
      steps.push({ from, to: "off" });
    }
  }
  return steps;
}

type Play = { steps: Step[] };

function search(position: Position, remaining: number[]): Play[] {
  if (remaining.length === 0) return [{ steps: [] }];

  const seen = new Set<number>();
  const plays: Play[] = [];
  let any = false;
  for (let i = 0; i < remaining.length; i++) {
    const die = remaining[i]!;
    if (seen.has(die)) continue;
    seen.add(die);
    const options = possibleSteps(position, die);
    if (options.length === 0) continue;
    any = true;
    const nextDice = remaining.slice(0, i).concat(remaining.slice(i + 1));
    for (const step of options) {
      const nextPos = applySteps(position, [step]);
      for (const rest of search(nextPos, nextDice)) {
        plays.push({ steps: [step, ...rest.steps] });
      }
    }
  }
  if (!any) return [{ steps: [] }];
  return plays;
}

function boardKey(position: Position): string {
  return `${position.points.join(",")}|${position.bar.p1},${position.bar.p2}|${position.off.p1},${position.off.p2}`;
}

function stepUsesDie(position: Position, step: Step, die: number): boolean {
  const player = position.onRoll;
  if (step.from === "bar") return enterPoint(player, die) === step.to;
  if (step.to === "off") {
    const dist = bearOffDistance(player, step.from);
    return die === dist || (die > dist && dist === furthestHomeDistance(position, player));
  }
  return destPoint(player, step.from, die) === step.to;
}

export function generateLegalPlays(position: Position): Step[][] {
  const dice = position.dice;
  if (!dice) throw new Error("dice required");
  const [d1, d2] = dice;
  if (
    !Number.isInteger(d1) ||
    !Number.isInteger(d2) ||
    d1 < 1 ||
    d1 > 6 ||
    d2 < 1 ||
    d2 > 6
  ) {
    throw new Error("dice must be two ints 1-6");
  }
  const remaining = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
  const raw = search(position, remaining);
  const maxLen = Math.max(0, ...raw.map((p) => p.steps.length));
  let best = raw.filter((p) => p.steps.length === maxLen);
  if (d1 !== d2 && maxLen === 1) {
    const higher = Math.max(d1, d2);
    const withHigher = best.filter((p) => p.steps[0] !== undefined && stepUsesDie(position, p.steps[0], higher));
    if (withHigher.length > 0) best = withHigher;
  }
  if (maxLen === 0) return [];
  const byBoard = new Map<string, Step[]>();
  for (const play of best) {
    if (play.steps.length === 0) continue;
    const result = applySteps(position, play.steps);
    const key = boardKey(result);
    const prev = byBoard.get(key);
    const sk = stepsKey(play.steps);
    if (!prev || sk < stepsKey(prev)) byBoard.set(key, play.steps);
  }
  return [...byBoard.values()];
}
