import type { Player, Position } from "ts-core";
import type { Flight } from "./diff";
import {
  FACE_ROTATION,
  FACE_TRANSFORMS,
  checkerClass,
  dieTransform,
  dimFlags,
  pipMask,
  type DieDim,
} from "./dice";

export type PointClick = number | "bar";

export type Extras = {
  usedDice: readonly number[];
  movable: ReadonlySet<PointClick>;
  swap: boolean;
};

const TOP_LEFT = [13, 14, 15, 16, 17, 18] as const;
const TOP_RIGHT = [19, 20, 21, 22, 23, 24] as const;
const BOT_LEFT = [12, 11, 10, 9, 8, 7] as const;
const BOT_RIGHT = [6, 5, 4, 3, 2, 1] as const;
const MAX_SHOWN = 6;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  attrs?: Record<string, string>,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  }
  return node;
}

function ownerOf(count: number): Player | null {
  if (count > 0) return "p1";
  if (count < 0) return "p2";
  return null;
}

function cubeText(position: Position): string {
  const { value, owner } = position.cube;
  return owner === "centered" ? `${value}` : `${value} ${owner}`;
}

function discsIn(stack: HTMLElement): HTMLElement[] {
  return [...stack.querySelectorAll<HTMLElement>(":scope > .bb-checker")];
}

/** The top checker gets the ring. Hidden checkers stay hidden. */
function applyRing(stack: HTMLElement, ring: boolean): void {
  const discs = discsIn(stack);
  discs.forEach((disc, i) => disc.classList.toggle("bb-ring", ring && i === discs.length - 1));
}

/** Keep existing discs. A paint shows every checker; the caller hides the ones that are about to fly in. */
function syncStack(stack: HTMLElement, player: Player | null, count: number, ring: boolean): void {
  stack.querySelector(":scope > .bb-badge")?.remove();
  const shown = player && count > 0 ? Math.min(count, MAX_SHOWN) : 0;
  let discs = discsIn(stack);
  if (!player || shown === 0 || discs.some((d) => !d.classList.contains(`bb-checker-${player}`))) {
    for (const disc of discs) disc.remove();
    discs = [];
  }
  while (discs.length > shown) discs.pop()!.remove();
  while (player && discs.length < shown) {
    const disc = el("span", checkerClass(player));
    stack.append(disc);
    discs.push(disc);
  }
  for (const disc of discs) disc.classList.remove("bb-hidden");
  applyRing(stack, ring);
  if (count > MAX_SHOWN) {
    const badge = el("span", "bb-badge");
    badge.textContent = String(count);
    stack.append(badge);
  }
}

function face(value: number, player: Player): HTMLElement {
  const node = el("div", `bb-face bb-face-${player}`);
  node.style.transform = FACE_TRANSFORMS[value] ?? FACE_TRANSFORMS[1]!;
  for (const on of pipMask(value)) {
    node.append(el("span", on ? `bb-pip bb-pip-${player}` : "bb-pip bb-pip-off"));
  }
  return node;
}

function makeDie(value: number, player: Player, dim: DieDim): HTMLElement {
  const die = el("div", `bb-die${dim === "used" ? " bb-die-used" : ""}`, { "data-value": String(value) });
  const cube = el("div", "bb-die-cube");
  const [rx, ry] = FACE_ROTATION[value] ?? FACE_ROTATION[1]!;
  cube.style.transform = dieTransform(rx, ry);
  for (let n = 1; n <= 6; n++) cube.append(face(n, player));
  die.append(cube);
  if (dim === "half") die.append(el("div", "bb-die-half"));
  return die;
}

function applyDim(die: HTMLElement, dim: DieDim): void {
  die.classList.toggle("bb-die-used", dim === "used");
  const half = die.querySelector(".bb-die-half");
  if (dim === "half" && !half) die.append(el("div", "bb-die-half"));
  if (dim !== "half" && half) half.remove();
}

function point(id: number, grow: "up" | "down"): HTMLElement {
  const node = el("div", "bb-point", { "data-point": String(id) });
  const tri = el("div", `bb-tri bb-tri-${grow} ${id % 2 === 1 ? "bb-tri-odd" : "bb-tri-even"}`);
  const label = el("span", "bb-label");
  label.textContent = String(id);
  const stack = el("div", `bb-stack bb-stack-${grow}`);
  node.append(tri);
  if (grow === "down") node.append(label, stack);
  else node.append(stack, label);
  return node;
}

function quad(ids: readonly number[], grow: "up" | "down", place: string): HTMLElement {
  const node = el("div", `bb-quad ${place}`);
  for (const id of ids) node.append(point(id, grow));
  return node;
}

export type BoardView = {
  root: HTMLElement;
  showError(message: string): void;
  /** Show every checker of this position. Does not restart a dice spin when the faces are unchanged. */
  show(position: Position, extras: Extras): void;
  /** Rings and spent dice only. Leaves a checker that is still in the air hidden. */
  restyle(position: Position, extras: Extras): void;
  /** Hide each flight's landing checker. One node per flight, in flight order. */
  hideArrivals(flights: readonly Flight[]): (HTMLElement | null)[];
  unhide(): void;
};

export function createView(
  root: HTMLElement,
  onPoint: (point: PointClick) => void,
  onSwap: () => void,
): BoardView {
  root.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    if (target.closest(".bb-swap")) {
      onSwap();
      return;
    }
    if (target.closest('[data-slot="bar-p1"]')) {
      onPoint("bar");
      return;
    }
    const pointEl = target.closest<HTMLElement>("[data-point]");
    if (pointEl?.dataset.point) onPoint(Number(pointEl.dataset.point));
  });

  const skeleton = (): void => {
    root.className = "bb-board";
    const bar = el("div", "bb-bar");
    bar.append(
      el("div", "bb-bar-slot bb-bar-p2", { "data-slot": "bar-p2" }),
      el("div", "bb-cube-wrap"),
      el("div", "bb-bar-slot bb-bar-p1", { "data-slot": "bar-p1" }),
    );
    bar.querySelector(".bb-bar-p2")!.append(el("div", "bb-stack bb-stack-down"));
    bar.querySelector(".bb-cube-wrap")!.append(el("div", "bb-cube"));
    bar.querySelector(".bb-bar-p1")!.append(el("div", "bb-stack bb-stack-up"));
    const off = el("div", "bb-off");
    off.append(
      el("div", "bb-off-slot bb-off-p2", { "data-slot": "off-p2" }),
      el("div", "bb-off-slot bb-off-p1", { "data-slot": "off-p1" }),
    );
    off.querySelector(".bb-off-p2")!.append(el("div", "bb-stack bb-stack-down"));
    off.querySelector(".bb-off-p1")!.append(el("div", "bb-stack bb-stack-up"));
    root.replaceChildren(
      quad(TOP_LEFT, "down", "bb-tl"),
      el("div", "bb-tray bb-tray-left"),
      bar,
      quad(TOP_RIGHT, "down", "bb-tr"),
      el("div", "bb-tray bb-tray-right"),
      off,
      quad(BOT_LEFT, "up", "bb-bl"),
      quad(BOT_RIGHT, "up", "bb-br"),
    );
  };

  const stackOf = (selector: string): HTMLElement => {
    const node = root.querySelector<HTMLElement>(selector);
    if (!node) throw new Error(`missing ${selector}`);
    return node.querySelector<HTMLElement>(":scope > .bb-stack") ?? node;
  };

  const paintCheckers = (position: Position, extras: Extras): void => {
    for (const pointEl of root.querySelectorAll<HTMLElement>("[data-point]")) {
      const id = Number(pointEl.dataset.point);
      const value = position.points[id - 1] ?? 0;
      const who = ownerOf(value);
      const stack = pointEl.querySelector<HTMLElement>(":scope > .bb-stack");
      if (!stack) continue;
      pointEl.classList.toggle("bb-movable", extras.movable.has(id));
      syncStack(stack, who, Math.abs(value), extras.movable.has(id));
    }
    const barP1 = extras.movable.has("bar");
    root.querySelector('[data-slot="bar-p1"]')?.classList.toggle("bb-movable", barP1);
    syncStack(stackOf('[data-slot="bar-p2"]'), position.bar.p2 > 0 ? "p2" : null, position.bar.p2, false);
    syncStack(stackOf('[data-slot="bar-p1"]'), position.bar.p1 > 0 ? "p1" : null, position.bar.p1, barP1);
    syncStack(stackOf('[data-slot="off-p2"]'), position.off.p2 > 0 ? "p2" : null, position.off.p2, false);
    syncStack(stackOf('[data-slot="off-p1"]'), position.off.p1 > 0 ? "p1" : null, position.off.p1, false);
    const cube = root.querySelector(".bb-cube");
    if (cube) cube.textContent = cubeText(position);
  };

  const stackFor = (flight: Flight): HTMLElement | null => {
    if (flight.to === "bar" || flight.to === "off") {
      return root.querySelector(`[data-slot="${flight.to}-${flight.player}"] > .bb-stack`);
    }
    return root.querySelector(`[data-point="${flight.to}"] > .bb-stack`);
  };

  const paintDice = (position: Position, extras: Extras): void => {
    const left = root.querySelector(".bb-tray-left");
    const right = root.querySelector(".bb-tray-right");
    if (!left || !right) return;
    const tray = position.onRoll === "p2" ? left : right;
    const other = tray === left ? right : left;
    other.querySelector(".bb-dice")?.remove();
    other.querySelector(".bb-swap")?.remove();
    if (!position.dice) {
      tray.querySelector(".bb-dice")?.remove();
      tray.querySelector(".bb-swap")?.remove();
      return;
    }
    const key = `${position.onRoll}:${position.dice[0]},${position.dice[1]}`;
    const dims = dimFlags(position.dice, extras.usedDice);
    let dice = tray.querySelector<HTMLElement>(":scope > .bb-dice");
    if (dice?.dataset.key !== key) {
      dice?.remove();
      dice = el("div", "bb-dice");
      dice.dataset.key = key;
      dice.append(
        makeDie(position.dice[0], position.onRoll, dims[0]),
        makeDie(position.dice[1], position.onRoll, dims[1]),
      );
      tray.prepend(dice);
    } else {
      const dies = dice.querySelectorAll<HTMLElement>(":scope > .bb-die");
      if (dies[0]) applyDim(dies[0], dims[0]);
      if (dies[1]) applyDim(dies[1], dims[1]);
    }
    let swap = tray.querySelector<HTMLButtonElement>(":scope > .bb-swap");
    if (extras.swap) {
      if (!swap) {
        swap = el("button", "bb-swap");
        swap.type = "button";
        swap.textContent = "Swap dice";
        tray.append(swap);
      }
    } else {
      swap?.remove();
    }
  };

  const ensure = (): void => {
    if (!root.querySelector(".bb-quad")) skeleton();
  };

  return {
    root,
    showError(message: string): void {
      root.className = "bb-board bb-error";
      root.textContent = message;
    },
    show(position, extras): void {
      ensure();
      paintCheckers(position, extras);
      paintDice(position, extras);
    },
    restyle(position, extras): void {
      if (!root.querySelector(".bb-quad")) return;
      for (const pointEl of root.querySelectorAll<HTMLElement>("[data-point]")) {
        const id = Number(pointEl.dataset.point);
        const movable = extras.movable.has(id);
        pointEl.classList.toggle("bb-movable", movable);
        const stack = pointEl.querySelector<HTMLElement>(":scope > .bb-stack");
        if (stack) applyRing(stack, movable);
      }
      const barMovable = extras.movable.has("bar");
      const bar = root.querySelector<HTMLElement>('[data-slot="bar-p1"]');
      bar?.classList.toggle("bb-movable", barMovable);
      const barStack = bar?.querySelector<HTMLElement>(":scope > .bb-stack");
      if (barStack) applyRing(barStack, barMovable);
      paintDice(position, extras);
    },
    hideArrivals(flights): (HTMLElement | null)[] {
      const landed: (HTMLElement | null)[] = flights.map(() => null);
      const groups = new Map<HTMLElement, number[]>();
      flights.forEach((flight, index) => {
        const stack = stackFor(flight);
        if (!stack) return;
        const indexes = groups.get(stack) ?? [];
        indexes.push(index);
        groups.set(stack, indexes);
      });
      for (const [stack, indexes] of groups) {
        const discs = discsIn(stack);
        const arrivals = discs.slice(Math.max(0, discs.length - indexes.length));
        indexes.forEach((flightIndex, k) => {
          const disc = arrivals[k];
          if (!disc) return;
          disc.classList.add("bb-hidden");
          landed[flightIndex] = disc;
        });
      }
      return landed;
    },
    unhide(): void {
      root.querySelectorAll(".bb-hidden").forEach((n) => n.classList.remove("bb-hidden"));
    },
  };
}
