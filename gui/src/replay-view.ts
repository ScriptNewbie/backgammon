import { animateCheckerPlay, animateCube, cancelMoveAnimation, measureCheckerTip, rollDice } from "./animate";
import { dom, showError, type Screen } from "./dom";
import { buildFrames } from "./replay";
import { actionNotice, renderBoard, renderHud } from "./render";
import { parseMatchSgf } from "./sgf";
import type { Frame } from "./types";

const tools = document.querySelector<HTMLElement>("#replay-tools")!;
const controls = document.querySelector<HTMLElement>("#replay-controls")!;
const fileInput = document.querySelector<HTMLInputElement>("#file")!;
const prevBtn = document.querySelector<HTMLButtonElement>("#prev")!;
const nextBtn = document.querySelector<HTMLButtonElement>("#next")!;
const progressEl = document.querySelector<HTMLSpanElement>("#progress")!;

let frames: Frame[] = [];
let index = 0;
let active = false;
let error: string | null = null;

function render(): void {
  cancelMoveAnimation();
  showError(error);
  dom.caption.title = "";
  const frame = frames[index];
  if (!frame) {
    dom.hud.hidden = true;
    dom.board.hidden = true;
    dom.notice.hidden = true;
    dom.caption.hidden = true;
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    progressEl.textContent = "No file";
    return;
  }
  dom.hud.hidden = false;
  dom.board.hidden = false;
  dom.caption.hidden = false;
  dom.hud.innerHTML = renderHud(frame, index, frames.length);
  dom.board.innerHTML = renderBoard(frame.position, frame.usedDice);
  dom.caption.textContent = frame.caption;
  dom.notice.hidden = false;
  dom.notice.textContent = actionNotice(frame) ?? " ";
  prevBtn.disabled = index <= 0;
  nextBtn.disabled = index >= frames.length - 1;
  progressEl.textContent = `${index + 1} / ${frames.length}`;
}

function playFrameAnimation(frame: Frame, reverse: boolean, from: { x: number; y: number } | null): void {
  const event = reverse ? frames[index + 1]?.lastEvent : frame.lastEvent;
  if (!event) return;
  if (event.kind === "cube") {
    animateCube(dom.board);
    return;
  }
  if (event.kind === "roll") {
    if (!reverse) void rollDice(dom.board);
    return;
  }
  void animateCheckerPlay({
    root: dom.board,
    player: event.player,
    steps: event.steps,
    reverse,
    from: from ?? undefined,
  });
}

function go(delta: number): void {
  if (frames.length === 0) return;
  const nextIndex = Math.min(frames.length - 1, Math.max(0, index + delta));
  if (nextIndex === index) return;
  const reverse = delta < 0;
  const event = reverse ? frames[index]?.lastEvent : frames[nextIndex]?.lastEvent;
  let from: { x: number; y: number } | null = null;
  if (event?.kind === "move" && event.steps[0]) {
    const origin = reverse ? event.steps[0].to : event.steps[0].from;
    from = measureCheckerTip(dom.board, origin, event.player);
  }
  index = nextIndex;
  const frame = frames[index]!;
  render();
  playFrameAnimation(frame, reverse, from);
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    frames = buildFrames(parseMatchSgf(text));
    error = null;
  } catch (err) {
    frames = [];
    error = err instanceof Error ? err.message : String(err);
  }
  index = 0;
  if (active) render();
});

prevBtn.addEventListener("click", () => go(-1));
nextBtn.addEventListener("click", () => go(1));

window.addEventListener("keydown", (ev) => {
  if (!active) return;
  if (ev.key === "ArrowLeft") go(-1);
  if (ev.key === "ArrowRight") go(1);
});

export const replayScreen: Screen = {
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
