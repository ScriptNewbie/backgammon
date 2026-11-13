import { resetBoard, syncBoard } from "./board-host";
import { dom, showError, type Screen } from "./dom";
import { buildFrames } from "./replay";
import { actionNotice, renderHud } from "./render";
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

function render(reset = false): void {
  if (reset) resetBoard();
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
  void syncBoard(frame.position, { usedDice: frame.usedDice, movable: [], swap: false });
  dom.caption.textContent = frame.caption;
  dom.notice.hidden = false;
  dom.notice.textContent = actionNotice(frame) ?? " ";
  prevBtn.disabled = index <= 0;
  nextBtn.disabled = index >= frames.length - 1;
  progressEl.textContent = `${index + 1} / ${frames.length}`;
}

function go(delta: number): void {
  if (frames.length === 0) return;
  const nextIndex = Math.min(frames.length - 1, Math.max(0, index + delta));
  if (nextIndex === index) return;
  index = nextIndex;
  render();
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
  if (active) render(true);
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
    render(true);
  },
  deactivate() {
    active = false;
    tools.hidden = true;
    controls.hidden = true;
  },
};
