import { applySteps, applyTake, clonePosition, openingPosition, opponent, stepsKey } from "ts-core";
import type { Frame, Player, Position, ReplayEvent, SgfEvent, SgfGame } from "./types";

function playerName(player: Player): string {
  return player;
}

function formatDice(dice: [number, number]): string {
  return `${dice[0]}-${dice[1]}`;
}

function formatMove(player: Player, dice: [number, number], steps: { from: number | "bar"; to: number | "off" }[]): string {
  return `${playerName(player)} ${dice[0]}${dice[1]}: ${stepsKey(steps)}`;
}

function formatCube(player: Player, action: "double" | "take" | "drop"): string {
  if (action === "double") return `${playerName(player)} offered`;
  if (action === "take") return `${playerName(player)} accepted`;
  return `${playerName(player)} dropped`;
}

function stepPips(player: Player, step: { from: number | "bar"; to: number | "off" }): number {
  if (step.from === "bar") {
    const to = step.to as number;
    return player === "p1" ? 25 - to : to;
  }
  if (step.to === "off") {
    const from = step.from as number;
    return player === "p1" ? from : 25 - from;
  }
  return Math.abs(step.from - step.to);
}

function consumeDie(remaining: number[], pips: number, toOff: boolean): { die: number; remaining: number[] } {
  const exact = remaining.indexOf(pips);
  if (exact >= 0) {
    return { die: remaining[exact]!, remaining: remaining.filter((_, i) => i !== exact) };
  }
  if (toOff) {
    let best = -1;
    for (let i = 0; i < remaining.length; i++) {
      const v = remaining[i]!;
      if (v >= pips && (best < 0 || v < remaining[best]!)) best = i;
    }
    if (best >= 0) {
      return { die: remaining[best]!, remaining: remaining.filter((_, i) => i !== best) };
    }
  }
  return { die: remaining[0] ?? pips, remaining: remaining.slice(1) };
}

function openingDice(dice: [number, number]): number[] {
  if (dice[0] === dice[1]) return [dice[0], dice[0], dice[0], dice[0]];
  return [dice[0], dice[1]];
}

function openingFrame(game: SgfGame, position: Position): Frame {
  return {
    position,
    lastEvent: null,
    gameIndex: game.gameIndex,
    eventIndex: -1,
    caption: game.gameIndex === 0 ? "Opening" : `Game ${game.gameIndex} opening`,
    players: { p1: game.p1, p2: game.p2 },
    result: game.result,
    usedDice: [],
  };
}

function applyEvent(position: Position, event: SgfEvent): Position {
  if (event.kind === "move") {
    let next = clonePosition(position);
    next.onRoll = event.player;
    next.dice = event.dice;
    if (event.steps.length > 0) next = applySteps(next, event.steps);
    return next;
  }
  const next = clonePosition(position);
  next.dice = null;
  if (event.action === "double") {
    next.onRoll = event.player;
    return next;
  }
  if (event.action === "take") {
    return applyTake(next, opponent(event.player));
  }
  return next;
}

function applyRoll(position: Position, player: Player, dice: [number, number]): Position {
  const next = clonePosition(position);
  next.onRoll = player;
  next.dice = dice;
  return next;
}

function afterMove(position: Position, mover: Player): Position {
  const next = clonePosition(position);
  next.onRoll = opponent(mover);
  next.dice = null;
  return next;
}

function pushFrame(
  frames: Frame[],
  game: SgfGame,
  pos: Position,
  event: ReplayEvent,
  eventIndex: number,
  caption: string,
  usedDice: number[] = [],
): void {
  frames.push({
    position: clonePosition(pos),
    lastEvent: event,
    gameIndex: game.gameIndex,
    eventIndex,
    caption,
    players: { p1: game.p1, p2: game.p2 },
    result: game.result,
    usedDice,
  });
}

/** One frame per opening, cube, dice roll, and individual checker step. */
export function buildFrames(games: readonly SgfGame[]): Frame[] {
  const frames: Frame[] = [];
  for (const game of games) {
    let pos = openingPosition(game.length, { p1: game.ws, p2: game.bs }, game.phase);
    frames.push(openingFrame(game, clonePosition(pos)));
    let eventIndex = 0;
    for (const event of game.events) {
      if (event.kind === "cube") {
        pos = applyEvent(pos, event);
        pushFrame(frames, game, pos, event, eventIndex, formatCube(event.player, event.action));
        eventIndex += 1;
        if (event.action === "drop") break;
        continue;
      }

      const canMove = event.steps.length > 0;
      const roll: ReplayEvent = { kind: "roll", player: event.player, dice: event.dice, canMove };
      pos = applyRoll(pos, event.player, event.dice);
      pushFrame(frames, game, pos, roll, eventIndex, `${playerName(event.player)} rolls ${formatDice(event.dice)}`);
      eventIndex += 1;

      let remaining = openingDice(event.dice);
      const used: number[] = [];
      for (const step of event.steps) {
        const one: SgfEvent = {
          kind: "move",
          player: event.player,
          dice: event.dice,
          steps: [step],
        };
        const spent = consumeDie(remaining, stepPips(event.player, step), step.to === "off");
        remaining = spent.remaining;
        used.push(spent.die);
        pos = applyEvent(pos, one);
        pushFrame(frames, game, pos, one, eventIndex, formatMove(event.player, event.dice, one.steps), [...used]);
        eventIndex += 1;
      }
      pos = afterMove(pos, event.player);
    }
  }
  return frames;
}
