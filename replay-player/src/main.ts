import "./style.css";
import { animateCheckerPlay, animateCube, cancelMoveAnimation, measureCheckerTip } from "./animate";
import { buildFrames } from "./replay";
import { actionNotice, renderBoard, renderHud } from "./render";
import { parseMatchSgf } from "./sgf";
import type { Frame } from "./types";

const fileInput = document.querySelector<HTMLInputElement>("#file")!;
const errorEl = document.querySelector<HTMLParagraphElement>("#error")!;
const hudEl = document.querySelector<HTMLElement>("#hud")!;
const boardEl = document.querySelector<HTMLElement>("#board")!;
const noticeEl = document.querySelector<HTMLParagraphElement>("#notice")!;
const captionEl = document.querySelector<HTMLParagraphElement>("#caption")!;
const prevBtn = document.querySelector<HTMLButtonElement>("#prev")!;
const nextBtn = document.querySelector<HTMLButtonElement>("#next")!;
const progressEl = document.querySelector<HTMLSpanElement>("#progress")!;

let frames: Frame[] = [];
let index = 0;

function showError(message: string | null): void {
  if (!message) {
    errorEl.hidden = true;
    errorEl.textContent = "";
    return;
  }
  errorEl.hidden = false;
  errorEl.textContent = message;
}

function render(): void {
  cancelMoveAnimation();
  const frame = frames[index];
  if (!frame) {
    hudEl.hidden = true;
    boardEl.hidden = true;
    noticeEl.hidden = true;
    captionEl.hidden = true;
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    progressEl.textContent = "No file";
    return;
  }
  hudEl.hidden = false;
  boardEl.hidden = false;
  captionEl.hidden = false;
  hudEl.innerHTML = renderHud(frame, index, frames.length);
  const rolling = frame.lastEvent?.kind === "roll";
  boardEl.innerHTML = renderBoard(frame.position, rolling, frame.usedDice);
  if (rolling) {
    for (const cube of boardEl.querySelectorAll(".die-cube")) {
      cube.addEventListener(
        "animationend",
        () => cube.parentElement?.classList.remove("rolling"),
        { once: true },
      );
    }
  }
  captionEl.textContent = frame.caption;
  noticeEl.hidden = false;
  noticeEl.textContent = actionNotice(frame) ?? "\u00a0";
  prevBtn.disabled = index <= 0;
  nextBtn.disabled = index >= frames.length - 1;
  progressEl.textContent = `${index + 1} / ${frames.length}`;
}

function playFrameAnimation(
  frame: Frame,
  reverse: boolean,
  from: { x: number; y: number } | null,
): void {
  const event = reverse ? frames[index + 1]?.lastEvent : frame.lastEvent;
  if (!event) return;
  if (event.kind === "cube") {
    animateCube(boardEl);
    return;
  }
  if (event.kind === "roll") return;
  void animateCheckerPlay({
    root: boardEl,
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
    from = measureCheckerTip(boardEl, origin, event.player);
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
    index = 0;
    showError(null);
    render();
  } catch (err) {
    frames = [];
    index = 0;
    showError(err instanceof Error ? err.message : String(err));
    render();
  }
});

prevBtn.addEventListener("click", () => go(-1));
nextBtn.addEventListener("click", () => go(1));

window.addEventListener("keydown", (ev) => {
  if (ev.key === "ArrowLeft") go(-1);
  if (ev.key === "ArrowRight") go(1);
});

render();
