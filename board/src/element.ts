import { positionFromXgid, type Position } from "ts-core";
import css from "./board.css?inline";
import { clearFlyers, flyAll, measureStarts } from "./animate";
import { diffMotion } from "./diff";
import { pulseCube, rollDice } from "./dice";
import { createView, type Extras, type PointClick } from "./view";

/**
 * `<backgammon-board xgid="XGID=...">`.
 * `usedDice`, `movable`, and `swap` are properties.
 * Events: `point` (`detail.point`), `swap`, `settled`.
 */
export class BackgammonBoardElement extends HTMLElement {
  static observedAttributes = ["xgid"];

  #mount: HTMLDivElement | null = null;
  #xgid = "";
  #painted = "";
  #shown: Position | null = null;
  #usedDice: number[] = [];
  #movable: PointClick[] = [];
  #swap = false;
  #scheduled = false;
  #gen = 0;
  #view: ReturnType<typeof createView> | null = null;

  get xgid(): string {
    return this.#xgid;
  }

  set xgid(value: string) {
    this.setAttribute("xgid", value);
  }

  get usedDice(): readonly number[] {
    return this.#usedDice;
  }

  set usedDice(value: readonly number[]) {
    this.#usedDice = [...value];
    this.#schedule();
  }

  get movable(): readonly PointClick[] {
    return this.#movable;
  }

  set movable(value: readonly PointClick[]) {
    this.#movable = [...value];
    this.#schedule();
  }

  get swap(): boolean {
    return this.#swap;
  }

  set swap(value: boolean) {
    this.#swap = value;
    this.#schedule();
  }

  connectedCallback(): void {
    if (this.#mount) return;
    const shadow = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = css;
    const mount = document.createElement("div");
    mount.style.display = "flex";
    mount.style.flex = "1 1 auto";
    mount.style.minHeight = "0";
    mount.style.height = "100%";
    const board = document.createElement("div");
    board.className = "bb-board";
    mount.append(board);
    shadow.append(style, mount);
    this.#mount = mount;
    this.#view = createView(
      board,
      (point) => {
        this.dispatchEvent(new CustomEvent("point", { detail: { point }, bubbles: true, composed: true }));
      },
      () => {
        this.dispatchEvent(new CustomEvent("swap", { bubbles: true, composed: true }));
      },
    );
    this.#xgid = this.getAttribute("xgid") ?? this.#xgid;
    this.#schedule();
  }

  disconnectedCallback(): void {
    this.#gen += 1;
    this.#view = null;
    this.#mount = null;
    this.#shown = null;
    this.#painted = "";
    this.#scheduled = false;
  }

  attributeChangedCallback(name: string, oldValue: string | null, value: string | null): void {
    if (name !== "xgid" || oldValue === value) return;
    this.#xgid = value ?? "";
    this.#schedule();
  }

  #extras(): Extras {
    return { usedDice: this.#usedDice, movable: new Set(this.#movable), swap: this.#swap };
  }

  #settle(): void {
    queueMicrotask(() => {
      this.dispatchEvent(new CustomEvent("settled", { bubbles: true, composed: true }));
    });
  }

  #schedule(): void {
    if (!this.#view || this.#scheduled) return;
    this.#scheduled = true;
    queueMicrotask(() => {
      this.#scheduled = false;
      this.#paint();
    });
  }

  #paint(): void {
    const view = this.#view;
    if (!view) return;
    let position: Position;
    try {
      if (!this.#xgid) throw new Error("");
      position = positionFromXgid(this.#xgid);
    } catch (err) {
      this.#gen += 1;
      clearFlyers(view.root);
      this.#shown = null;
      this.#painted = this.#xgid;
      view.showError(err instanceof Error ? err.message : String(err));
      this.#settle();
      return;
    }
    const extras = this.#extras();
    if (this.#shown && this.#painted === this.#xgid) {
      view.restyle(this.#shown, extras);
      return;
    }
    this.#gen += 1;
    const gen = this.#gen;
    clearFlyers(view.root);
    if (!this.#shown) {
      view.show(position, extras);
      this.#shown = position;
      this.#painted = this.#xgid;
      this.#settle();
      return;
    }
    view.unhide();
    const motion = diffMotion(this.#shown, position);
    const starts = measureStarts(view.root, motion.flights);
    view.show(position, extras);
    const arrivals = view.hideArrivals(motion.flights);
    this.#shown = position;
    this.#painted = this.#xgid;
    const current = (): boolean => this.#gen === gen;
    void (async () => {
      const tasks: Promise<void>[] = [];
      if (motion.roll) tasks.push(rollDice(view.root));
      if (motion.cube) tasks.push(pulseCube(view.root));
      if (motion.flights.length > 0) tasks.push(flyAll(view.root, motion.flights, starts, arrivals, current));
      await Promise.all(tasks);
      if (!current()) return;
      this.#settle();
    })();
  }
}

if (!customElements.get("backgammon-board")) {
  customElements.define("backgammon-board", BackgammonBoardElement);
}

export type { PointClick };
