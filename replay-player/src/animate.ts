import type { Player, Step } from "./types";

const FLY_MS = 320;

let generation = 0;

export function cancelMoveAnimation(): void {
  generation += 1;
  document.querySelectorAll(".flyer").forEach((n) => n.remove());
}

export function slotElement(root: HTMLElement, point: number | "bar" | "off", player: Player): HTMLElement | null {
  if (point === "bar") {
    return root.querySelector(player === "p1" ? '[data-slot="bar-p1"]' : '[data-slot="bar-p2"]');
  }
  if (point === "off") {
    return root.querySelector(player === "p2" ? '[data-slot="off-p2"]' : '[data-slot="off-p1"]');
  }
  return root.querySelector(`[data-point="${point}"]`);
}

function lastCheckers(slot: HTMLElement, n: number): HTMLElement[] {
  const all = [...slot.querySelectorAll<HTMLElement>(":scope .stack > .checker")];
  return all.slice(Math.max(0, all.length - n));
}

function centerOf(el: HTMLElement): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function visibleAnchor(slot: HTMLElement): { x: number; y: number } {
  const checkers = [...slot.querySelectorAll<HTMLElement>(":scope .stack > .checker")].filter(
    (c) => !c.classList.contains("pending"),
  );
  if (checkers.length > 0) return centerOf(checkers[checkers.length - 1]!);
  return centerOf(slot);
}

function pendingAnchor(slot: HTMLElement): { x: number; y: number } {
  const pending = slot.querySelectorAll<HTMLElement>(":scope .stack > .checker.pending");
  if (pending.length > 0) return centerOf(pending[pending.length - 1]!);
  return visibleAnchor(slot);
}

function flyChecker(player: Player, from: { x: number; y: number }, to: { x: number; y: number }, mine: number): Promise<void> {
  return new Promise((resolve) => {
    if (mine !== generation) {
      resolve();
      return;
    }
    const el = document.createElement("span");
    el.className = `checker ${player} flyer`;
    const size = 28;
    el.style.left = `${from.x - size / 2}px`;
    el.style.top = `${from.y - size / 2}px`;
    document.body.appendChild(el);
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
      el.remove();
      resolve();
    };
    el.addEventListener("transitionend", finish, { once: true });
    window.setTimeout(finish, FLY_MS + 80);
  });
}

export function measureCheckerTip(
  root: HTMLElement,
  point: number | "bar" | "off",
  player: Player,
): { x: number; y: number } | null {
  const slot = slotElement(root, point, player);
  if (!slot) return null;
  const checkers = slot.querySelectorAll<HTMLElement>(":scope .stack > .checker");
  if (checkers.length === 0) return null;
  return centerOf(checkers[checkers.length - 1]!);
}

export async function animateCheckerPlay(opts: {
  root: HTMLElement;
  player: Player;
  steps: readonly Step[];
  reverse: boolean;
  from?: { x: number; y: number };
}): Promise<void> {
  const mine = ++generation;
  document.querySelectorAll(".flyer").forEach((n) => n.remove());

  const steps = opts.reverse
    ? [...opts.steps].reverse().map((s) => ({ from: s.to, to: s.from }))
    : opts.steps;
  if (steps.length === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const arrivals = new Map<HTMLElement, HTMLElement[]>();
  for (const step of steps) {
    const dest = slotElement(opts.root, step.to, opts.player);
    if (!dest) continue;
    const hidden = arrivals.get(dest) ?? [];
    const next = lastCheckers(dest, hidden.length + 1);
    const extra = next.find((c) => !hidden.includes(c));
    if (extra) {
      extra.classList.add("pending");
      arrivals.set(dest, [...hidden, extra]);
    }
  }

  const reveal = (slot: HTMLElement | null): void => {
    if (!slot) return;
    const pending = arrivals.get(slot);
    const checker = pending?.pop();
    if (!checker) return;
    checker.classList.remove("pending");
  };

  for (const step of steps) {
    if (mine !== generation) return;
    const fromSlot = slotElement(opts.root, step.from, opts.player);
    const toSlot = slotElement(opts.root, step.to, opts.player);
    const start = opts.from ?? (fromSlot ? visibleAnchor(fromSlot) : { x: 0, y: 0 });
    const end = toSlot ? pendingAnchor(toSlot) : start;
    await flyChecker(opts.player, start, end, mine);
    if (mine !== generation) return;
    reveal(toSlot);
  }
}

export function animateCube(root: HTMLElement): void {
  const cube = root.querySelector(".cube");
  cube?.classList.remove("cube-pulse");
  void (cube as HTMLElement | null)?.offsetWidth;
  cube?.classList.add("cube-pulse");
}
