import { checkerClass } from "./dice";
import type { Flight } from "./diff";
import type { Player, Point } from "ts-core";

const FLY_MS = 320;

export type XY = { x: number; y: number };

function centerOf(el: HTMLElement): XY {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function slotElement(root: HTMLElement, slot: Point, player: Player): HTMLElement | null {
  if (slot === "bar") return root.querySelector(`[data-slot="bar-${player}"]`);
  if (slot === "off") return root.querySelector(`[data-slot="off-${player}"]`);
  return root.querySelector(`[data-point="${slot}"]`);
}

function checkers(slot: HTMLElement): HTMLElement[] {
  return [...slot.querySelectorAll<HTMLElement>(":scope .bb-stack > .bb-checker")];
}

/** `depth` 0 is the visual tip (last checker). */
function tipCenter(root: HTMLElement, player: Player, slot: Point, depth: number): XY | null {
  const el = slotElement(root, slot, player);
  if (!el) return null;
  const discs = checkers(el).filter((c) => !c.classList.contains("bb-hidden"));
  const target = discs[discs.length - 1 - depth];
  return centerOf(target ?? el);
}

export function clearFlyers(root: HTMLElement): void {
  root.querySelectorAll(".bb-flyer").forEach((n) => n.remove());
}

/** Where each flight starts, measured on the board that is on screen now. */
export function measureStarts(root: HTMLElement, flights: readonly Flight[]): (XY | null)[] {
  const taken = new Map<string, number>();
  return flights.map((flight) => {
    const key = `${flight.player}:${flight.from}`;
    const depth = taken.get(key) ?? 0;
    taken.set(key, depth + 1);
    return tipCenter(root, flight.player, flight.from, depth);
  });
}

function flyChecker(
  root: HTMLElement,
  player: Player,
  from: XY,
  to: XY,
  current: () => boolean,
  land: () => void,
): Promise<void> {
  return new Promise((resolve) => {
    if (!current()) {
      resolve();
      return;
    }
    const el = document.createElement("span");
    el.className = `bb-flyer ${checkerClass(player)}`;
    const size = 28;
    el.style.left = `${from.x - size / 2}px`;
    el.style.top = `${from.y - size / 2}px`;
    root.appendChild(el);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transform = `translate(${dx}px, ${dy}px)`;
      });
    });
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      if (current()) land();
      el.remove();
      resolve();
    };
    el.addEventListener("transitionend", finish, { once: true });
    window.setTimeout(finish, FLY_MS + 80);
  });
}

/** Fly in order. Each landing unhides that flight's own checker before the flyer is removed. */
export async function flyAll(
  root: HTMLElement,
  flights: readonly Flight[],
  starts: readonly (XY | null)[],
  arrivals: readonly (HTMLElement | null)[],
  current: () => boolean,
): Promise<void> {
  const dests = arrivals.map((node) => (node ? centerOf(node) : null));
  for (let i = 0; i < flights.length; i++) {
    if (!current()) return;
    const flight = flights[i]!;
    const end = dests[i] ?? starts[i];
    const start = starts[i] ?? end;
    const land = (): void => {
      arrivals[i]?.classList.remove("bb-hidden");
    };
    if (start && end) await flyChecker(root, flight.player, start, end, current, land);
    else if (current()) land();
  }
}
