import {
  applySteps,
  applyTake,
  clonePosition,
  gameResult,
  generateLegalSequences,
  initialPhase,
  MAX_CUBE_VALUE,
  nextPhase,
  openingPosition,
  pointsAwarded,
  stepsKey,
  type LegalSequence,
  type MatchPhase,
  type Player,
  type Position,
  type Step,
} from "ts-core";
import { animateCheckerPlay, animateCube, cancelMoveAnimation, measureCheckerTip, rollDice } from "../animate";
import { dom, showError, type Screen } from "../dom";
import { renderBoard } from "../render";
import { cube, evaluate } from "./engine";
import {
  chooseStep,
  movableFrom,
  reviewMove,
  turnComplete,
  type EngineMove,
  type MoveReview,
  type PlayedStep,
} from "./rules";

const HUMAN: Player = "p1";
const ENGINE: Player = "p2";

const tools = document.querySelector<HTMLElement>("#play-tools")!;
const controls = document.querySelector<HTMLElement>("#play-controls")!;
const lengthSelect = document.querySelector<HTMLSelectElement>("#match-length")!;
const newMatchBtn = document.querySelector<HTMLButtonElement>("#new-match")!;

type Mode =
  | "idle"
  | "pre-roll" // human may roll or double
  | "moving" // human is clicking checkers
  | "answer-double" // engine doubled; human takes or drops
  | "busy" // dice / engine / animation in progress
  | "game-over"
  | "match-over"
  | "error";

type State = {
  /** Bumped by New match; async flows from an older match stop at their next await. */
  gen: number;
  mode: Mode;
  length: number;
  score: { p1: number; p2: number };
  phase: MatchPhase;
  pos: Position;
  /** Human turn: position after the roll, before any step, and the legal sequences from it. */
  start: Position | null;
  seqs: LegalSequence[];
  played: PlayedStep[];
  usedDice: number[];
  review: MoveReview | null;
  status: string;
  error: string | null;
  retry: (() => void) | null;
};

const state: State = {
  gen: 0,
  mode: "idle",
  length: 5,
  score: { p1: 0, p2: 0 },
  phase: "pre",
  pos: openingPosition(5, { p1: 0, p2: 0 }, "pre"),
  start: null,
  seqs: [],
  played: [],
  usedDice: [],
  review: null,
  status: "Pick a match length and press New match.",
  error: null,
  retry: null,
};

let active = false;

// ---------- helpers ----------

function die(): number {
  const buf = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0]! < 252) return (buf[0]! % 6) + 1;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

function canDouble(player: Player): boolean {
  const { pos } = state;
  return Boolean(pos.match && !pos.match.crawford && pos.cube.mayDouble[player] && pos.cube.value < MAX_CUBE_VALUE);
}

function who(player: Player): string {
  return player === HUMAN ? "You" : "Engine";
}

function fmt(eq: number): string {
  return `${eq >= 0 ? "+" : "−"}${Math.abs(eq).toFixed(3)}`;
}

/** Die used by each step of a play, via the legal sequence with the same step order. */
function diceForSteps(start: Position, steps: readonly Step[]): number[] {
  const key = stepsKey(steps);
  const seq = generateLegalSequences(start).find((s) => stepsKey(s.steps) === key);
  return seq ? seq.dice : [];
}

function stale(gen: number): boolean {
  return gen !== state.gen;
}

/** Run an engine call; on failure show the error and offer Retry of `again`. */
async function engineCall<T>(gen: number, call: () => Promise<T>, again: () => void): Promise<T | null> {
  try {
    return await call();
  } catch (err) {
    if (stale(gen)) return null;
    state.mode = "error";
    state.error = err instanceof Error ? err.message : String(err);
    state.retry = again;
    state.status = "Engine unavailable";
    render();
    return null;
  }
}

// ---------- rendering ----------

function hudHtml(): string {
  const { pos, score, length } = state;
  const cube = pos.cube.owner === "centered" ? `${pos.cube.value} (centered)` : `${pos.cube.value} (${who(pos.cube.owner)})`;
  const item = (label: string, value: string) =>
    `<div class="flex gap-1.5"><dt class="text-stone-500">${label}</dt><dd class="font-medium">${value}</dd></div>`;
  return `<dl class="flex flex-wrap gap-x-5 gap-y-1.5">
    ${item("Match to", String(length))}
    ${item("Score", `You ${score.p1} – ${score.p2} Engine`)}
    ${item("Cube", cube)}
    ${pos.match?.crawford ? item("Game", "Crawford") : ""}
    ${item("You", "p1 · white · bear off bottom right")}
  </dl>`;
}

const BTN_PRIMARY =
  "cursor-pointer rounded bg-stone-900 px-4 py-1.5 text-sm text-white hover:bg-stone-700 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-stone-900";
const BTN_SECONDARY =
  "cursor-pointer rounded border border-stone-300 bg-white px-4 py-1.5 text-sm text-stone-900 hover:bg-stone-50 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-white";

function button(action: string, label: string, primary: boolean, disabled = false): string {
  return `<button type="button" data-action="${action}" class="${primary ? BTN_PRIMARY : BTN_SECONDARY}" ${disabled ? "disabled" : ""}>${label}</button>`;
}

function controlsHtml(): string {
  switch (state.mode) {
    case "pre-roll":
      return `${button("double", `Double to ${state.pos.cube.value * 2}`, false)}${button("roll", "Roll", true)}`;
    case "moving":
      return `${button("undo", "Undo", false, state.played.length === 0)}${button("done", "Done", true, !turnComplete(state.seqs, state.played))}`;
    case "answer-double":
      return `${button("drop", "Drop", false)}${button("take", "Take", true)}`;
    case "game-over":
      return button("next-game", "Next game", true);
    case "match-over":
      return button("new-match", "New match", true);
    case "error":
      return button("retry", "Retry", true);
    default:
      return "";
  }
}

/**
 * Review of your last play, one block per line so it wraps instead of truncating.
 * Equity is cubeful for you, as the engine reports it (scaled by the cube value).
 * Content is step keys and numbers only, so innerHTML is safe.
 */
function reviewHtml(): string {
  const r = state.review;
  if (!r) return "";
  if (r.loss < 0.0005) return `<span>You ${r.yours} ${fmt(r.yourEquity)} · best move</span>`;
  return `<span>You ${r.yours} ${fmt(r.yourEquity)} · <span class="font-semibold text-amber-700">loss ${r.loss.toFixed(3)}</span></span>
    <span class="text-stone-500">Best ${r.best} ${fmt(r.bestEquity)}</span>`;
}

function render(): void {
  if (!active) return;
  showError(state.error);
  dom.hud.hidden = false;
  dom.board.hidden = false;
  dom.caption.hidden = false;
  dom.notice.hidden = false;
  dom.hud.innerHTML = hudHtml();
  const moving = state.mode === "moving";
  const dice = state.pos.dice;
  dom.board.innerHTML = renderBoard(state.pos, state.usedDice, {
    movable: moving ? movableFrom(state.seqs, state.played) : undefined,
    swap: moving && state.played.length === 0 && dice !== null && dice[0] !== dice[1],
  });
  dom.caption.innerHTML = reviewHtml();
  dom.caption.title = state.review ? "Your last move: cubeful equity for you (scaled by the cube) from game-engine" : "";
  dom.notice.textContent = state.status;
  controls.innerHTML = controlsHtml();
}

async function animateStep(player: Player, step: Step, reverse: boolean, apply: () => void): Promise<void> {
  const origin = reverse ? step.to : step.from;
  const from = active ? measureCheckerTip(dom.board, origin, player) : null;
  apply();
  render();
  if (!active) return;
  await animateCheckerPlay({ root: dom.board, player, steps: [step], reverse, from: from ?? undefined });
}

async function showRoll(): Promise<void> {
  render();
  if (active) await rollDice(dom.board);
}

// ---------- match flow ----------

function newMatch(): void {
  state.gen += 1;
  cancelMoveAnimation();
  state.length = Number(lengthSelect.value) || 5;
  state.score = { p1: 0, p2: 0 };
  state.phase = initialPhase(state.length);
  state.review = null;
  void startGame(state.gen);
}

async function startGame(gen: number): Promise<void> {
  state.pos = openingPosition(state.length, state.score, state.phase);
  state.error = null;
  state.usedDice = [];
  state.mode = "busy";
  let a = die();
  let b = die();
  while (a === b) {
    a = die();
    b = die();
  }
  state.pos.onRoll = a > b ? HUMAN : ENGINE;
  state.pos.dice = [Math.max(a, b), Math.min(a, b)];
  state.status = `Opening roll: ${state.pos.onRoll === HUMAN ? "you start" : "engine starts"}`;
  await showRoll();
  if (stale(gen)) return;
  await sleep(400);
  if (stale(gen)) return;
  if (state.pos.onRoll === HUMAN) beginMoving();
  else void engineMove(gen);
}

function humanTurn(gen: number): void {
  if (stale(gen)) return;
  state.pos = clonePosition(state.pos);
  state.pos.onRoll = HUMAN;
  state.pos.dice = null;
  state.usedDice = [];
  if (canDouble(HUMAN)) {
    state.mode = "pre-roll";
    state.status = "Your turn: roll or double";
    render();
    return;
  }
  void humanRoll(gen);
}

async function humanRoll(gen: number): Promise<void> {
  state.mode = "busy";
  state.pos = clonePosition(state.pos);
  state.pos.dice = [die(), die()];
  state.status = "You roll";
  await showRoll();
  if (stale(gen)) return;
  beginMoving();
}

function beginMoving(): void {
  const gen = state.gen;
  state.start = clonePosition(state.pos);
  state.seqs = generateLegalSequences(state.pos);
  state.played = [];
  state.usedDice = [];
  if (state.seqs.length === 0) {
    state.mode = "busy";
    state.status = "You cannot move";
    render();
    void sleep(1200).then(() => {
      if (!stale(gen)) void finishHumanTurn(gen);
    });
    return;
  }
  state.mode = "moving";
  state.status = "Your move: click a checker";
  render();
}

async function humanStep(from: number | "bar"): Promise<void> {
  const dice = state.pos.dice;
  if (state.mode !== "moving" || !dice) return;
  const choice = chooseStep(state.seqs, state.played, from, dice);
  if (!choice) return;
  state.played = [...state.played, choice];
  state.usedDice = state.played.map((p) => p.die);
  state.status = turnComplete(state.seqs, state.played) ? "Press Done to end your turn" : "Your move: click a checker";
  await animateStep(HUMAN, choice.step, false, () => {
    state.pos = applySteps(state.pos, [choice.step]);
  });
}

async function undoStep(): Promise<void> {
  const last = state.played.at(-1);
  if (state.mode !== "moving" || !last || !state.start) return;
  const start = state.start;
  const played = state.played.slice(0, -1);
  state.played = played;
  state.usedDice = played.map((p) => p.die);
  state.status = "Your move: click a checker";
  await animateStep(HUMAN, last.step, true, () => {
    const pos = applySteps(start, played.map((p) => p.step));
    pos.dice = state.pos.dice;
    state.pos = pos;
  });
}

function swapDice(): void {
  const dice = state.pos.dice;
  if (state.mode !== "moving" || !dice || state.played.length > 0) return;
  state.pos = clonePosition(state.pos);
  state.pos.dice = [dice[1], dice[0]];
  render();
}

async function finishHumanTurn(gen: number): Promise<void> {
  const start = state.start;
  const steps = state.played.map((p) => p.step);
  state.mode = "busy";
  state.review = null;
  if (start && steps.length > 0) {
    state.status = "Engine is reviewing your move…";
    render();
    const moves = await engineCall(gen, () => evaluate(start), () => void finishHumanTurn(gen));
    if (stale(gen) || !moves) return;
    state.review = reviewMove(moves, start, steps);
  }
  const ended = gameResult(state.pos);
  if (ended) {
    endGame(gen, ended.winner, ended.multiplier, state.pos.cube.value, ended.kind);
    return;
  }
  state.pos = clonePosition(state.pos);
  state.pos.onRoll = ENGINE;
  state.pos.dice = null;
  state.usedDice = [];
  void engineTurn(gen);
}

async function engineTurn(gen: number): Promise<void> {
  if (stale(gen)) return;
  if (canDouble(ENGINE)) {
    state.status = "Engine is considering the cube…";
    render();
    const pos = clonePosition(state.pos);
    const decision = await engineCall(gen, () => cube(pos), () => void engineTurn(gen));
    if (stale(gen) || !decision) return;
    if (decision.offer !== "double") {
      await engineRoll(gen);
      return;
    }
    state.mode = "answer-double";
    state.status = `Engine doubles to ${state.pos.cube.value * 2}. Take or drop?`;
    render();
    if (active) animateCube(dom.board);
    return;
  }
  await engineRoll(gen);
}

async function answerDouble(take: boolean): Promise<void> {
  const gen = state.gen;
  if (state.mode !== "answer-double") return;
  if (!take) {
    endGame(gen, ENGINE, 1, state.pos.cube.value, "drop");
    return;
  }
  state.mode = "busy";
  state.pos = applyTake(state.pos, ENGINE);
  state.status = `You take. Cube at ${state.pos.cube.value}`;
  render();
  if (active) animateCube(dom.board);
  await sleep(500);
  if (stale(gen)) return;
  await engineRoll(gen);
}

async function engineRoll(gen: number): Promise<void> {
  state.mode = "busy";
  state.pos = clonePosition(state.pos);
  state.pos.dice = [die(), die()];
  state.status = "Engine rolls";
  await showRoll();
  if (stale(gen)) return;
  await engineMove(gen);
}

async function engineMove(gen: number): Promise<void> {
  state.mode = "busy";
  state.status = "Engine is thinking…";
  render();
  const start = clonePosition(state.pos);
  const moves: EngineMove[] | null = await engineCall(gen, () => evaluate(start), () => void engineMove(gen));
  if (stale(gen) || !moves) return;
  state.error = null;
  const best = moves[0];
  if (!best) {
    state.status = "Engine cannot move";
    render();
    await sleep(1200);
  } else {
    state.status = `Engine plays ${stepsKey(best.steps)}`;
    const dice = diceForSteps(start, best.steps);
    for (let i = 0; i < best.steps.length; i++) {
      const step = best.steps[i]!;
      state.usedDice = dice.slice(0, i + 1);
      await animateStep(ENGINE, step, false, () => {
        state.pos = applySteps(state.pos, [step]);
      });
      if (stale(gen)) return;
      await sleep(120);
      if (stale(gen)) return;
    }
  }
  const ended = gameResult(state.pos);
  if (ended) {
    endGame(gen, ended.winner, ended.multiplier, state.pos.cube.value, ended.kind);
    return;
  }
  await sleep(300);
  humanTurn(gen);
}

async function humanDouble(): Promise<void> {
  const gen = state.gen;
  if (state.mode !== "pre-roll") return;
  state.mode = "busy";
  state.status = `You double to ${state.pos.cube.value * 2}…`;
  render();
  if (active) animateCube(dom.board);
  await sleep(700);
  if (stale(gen)) return;
  await engineAnswersDouble(gen);
}

/** The engine takes or drops from its own `/cube` on the position with you on roll. */
async function engineAnswersDouble(gen: number): Promise<void> {
  const pos = clonePosition(state.pos);
  const decision = await engineCall(gen, () => cube(pos), () => void engineAnswersDouble(gen));
  if (stale(gen) || !decision) return;
  if (decision.take === "drop") {
    endGame(gen, HUMAN, 1, state.pos.cube.value, "drop");
    return;
  }
  state.pos = applyTake(state.pos, HUMAN);
  state.status = `Engine takes. Cube at ${state.pos.cube.value}`;
  render();
  await sleep(500);
  if (stale(gen)) return;
  await humanRoll(gen);
}

function endGame(
  gen: number,
  winner: Player,
  multiplier: 1 | 2 | 3,
  cubeValue: number,
  kind: "single" | "gammon" | "backgammon" | "drop",
): void {
  if (stale(gen)) return;
  const awarded = pointsAwarded(cubeValue, multiplier, state.length, state.score[winner]);
  state.score = { ...state.score, [winner]: state.score[winner] + awarded };
  state.phase = nextPhase(state.phase, state.score, state.length);
  state.pos = clonePosition(state.pos);
  state.pos.dice = null;
  state.usedDice = [];
  const how =
    kind === "drop"
      ? `${winner === HUMAN ? "Engine" : "You"} dropped`
      : kind === "single"
        ? ""
        : ` (${kind})`;
  const pts = `${awarded} point${awarded === 1 ? "" : "s"}`;
  const matchOver = state.score[winner] >= state.length;
  if (kind === "drop") {
    state.status = `${how}. ${who(winner)} ${winner === HUMAN ? "win" : "wins"} ${pts}`;
  } else {
    state.status = `${who(winner)} ${winner === HUMAN ? "win" : "wins"} ${pts}${how}`;
  }
  if (matchOver) {
    const loser = winner === HUMAN ? ENGINE : HUMAN;
    state.status = `${who(winner)} ${winner === HUMAN ? "win" : "wins"} the match ${state.score[winner]}–${state.score[loser]}`;
  }
  state.mode = matchOver ? "match-over" : "game-over";
  render();
}

// ---------- input ----------

dom.board.addEventListener("click", (ev) => {
  if (!active) return;
  const target = ev.target as HTMLElement;
  if (target.closest('[data-action="swap"]')) {
    swapDice();
    return;
  }
  if (state.mode !== "moving") return;
  const point = target.closest<HTMLElement>("[data-point]");
  if (point) {
    void humanStep(Number(point.dataset.point));
    return;
  }
  if (target.closest('[data-slot="bar-p1"]')) void humanStep("bar");
});

controls.addEventListener("click", (ev) => {
  const action = (ev.target as HTMLElement).closest<HTMLElement>("[data-action]")?.dataset.action;
  const gen = state.gen;
  switch (action) {
    case "roll":
      if (state.mode === "pre-roll") void humanRoll(gen);
      break;
    case "double":
      void humanDouble();
      break;
    case "undo":
      void undoStep();
      break;
    case "done":
      if (state.mode === "moving" && turnComplete(state.seqs, state.played)) void finishHumanTurn(gen);
      break;
    case "take":
      void answerDouble(true);
      break;
    case "drop":
      void answerDouble(false);
      break;
    case "next-game":
      if (state.mode === "game-over") void startGame(gen);
      break;
    case "new-match":
      newMatch();
      break;
    case "retry": {
      const again = state.retry;
      state.retry = null;
      state.error = null;
      state.mode = "busy";
      render();
      again?.();
      break;
    }
  }
});

newMatchBtn.addEventListener("click", newMatch);

export const playScreen: Screen = {
  activate() {
    active = true;
    tools.hidden = false;
    controls.hidden = false;
    render();
  },
  deactivate() {
    active = false;
    tools.hidden = true;
    controls.hidden = true;
    cancelMoveAnimation();
  },
};
