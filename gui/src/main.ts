import "./style.css";
import "board/element";
import type { Screen } from "./dom";
import { playScreen } from "./play/view";
import { replayScreen } from "./replay-view";

type Mode = "play" | "replay";

const screens: Record<Mode, Screen> = { play: playScreen, replay: replayScreen };
const tabs = [...document.querySelectorAll<HTMLButtonElement>("[data-mode]")];

const TAB_ON = ["bg-white", "text-stone-900", "font-medium"];
const TAB_OFF = ["text-stone-600", "hover:text-stone-900"];

let current: Mode | null = null;

function show(mode: Mode): void {
  if (mode === current) return;
  if (current) screens[current].deactivate();
  current = mode;
  for (const tab of tabs) {
    const on = tab.dataset.mode === mode;
    tab.setAttribute("aria-selected", String(on));
    tab.classList.remove(...TAB_ON, ...TAB_OFF);
    tab.classList.add(...(on ? TAB_ON : TAB_OFF));
  }
  screens[mode].activate();
}

for (const tab of tabs) {
  tab.addEventListener("click", () => show(tab.dataset.mode as Mode));
}

show("play");
