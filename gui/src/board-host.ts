import { positionToXgid, type Position } from "ts-core";
import { dom } from "./dom";

export type PointClick = number | "bar";

export type BoardEl = HTMLElement & {
  xgid: string;
  usedDice: readonly number[];
  movable: readonly PointClick[];
  swap: boolean;
};

export function boardEl(): BoardEl {
  const found = dom.board.querySelector<BoardEl>("backgammon-board");
  if (found) return found;
  return resetBoard();
}

export function resetBoard(): BoardEl {
  const el = document.createElement("backgammon-board") as BoardEl;
  dom.board.replaceChildren(el);
  return el;
}

export function settled(el: BoardEl): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, 2000);
    el.addEventListener(
      "settled",
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** Push the position. Waits for the flight when this element was already showing a different XGID. */
export function syncBoard(
  position: Position,
  opts: { usedDice: readonly number[]; movable: readonly PointClick[]; swap: boolean },
): Promise<void> {
  const el = boardEl();
  const next = positionToXgid(position);
  const changed = el.xgid !== next;
  const pending = changed && el.xgid !== "" ? settled(el) : null;
  el.usedDice = opts.usedDice;
  el.movable = opts.movable;
  el.swap = opts.swap;
  if (changed) el.xgid = next;
  return pending ?? Promise.resolve();
}
