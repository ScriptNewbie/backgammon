import type { Frame, Player, Position } from "./types";

const TOP_LEFT = [13, 14, 15, 16, 17, 18] as const;
const TOP_RIGHT = [19, 20, 21, 22, 23, 24] as const;
const BOT_LEFT = [12, 11, 10, 9, 8, 7] as const;
const BOT_RIGHT = [6, 5, 4, 3, 2, 1] as const;

const PIP_MASKS: Record<number, boolean[]> = {
  1: [false, false, false, false, true, false, false, false, false],
  2: [true, false, false, false, false, false, false, false, true],
  3: [true, false, false, false, true, false, false, false, true],
  4: [true, false, true, false, false, false, true, false, true],
  5: [true, false, true, false, true, false, true, false, true],
  6: [true, false, true, true, false, true, true, false, true],
};

/** Half the die edge (38px die); faces sit at ±HALF on each axis. */
const HALF = 19;

/** Checkers drawn per stack; more shows a count badge. Keeps a full stack inside a short viewport. */
const MAX_SHOWN = 6;

/** Where each face sits on the cube. */
const FACE_TRANSFORMS: Record<number, string> = {
  1: `rotateY(0deg) translateZ(${HALF}px)`,
  2: `rotateX(90deg) translateZ(${HALF}px)`,
  3: `rotateY(90deg) translateZ(${HALF}px)`,
  4: `rotateY(-90deg) translateZ(${HALF}px)`,
  5: `rotateX(-90deg) translateZ(${HALF}px)`,
  6: `rotateY(180deg) translateZ(${HALF}px)`,
};

/** Cube rotation [x, y] in degrees that brings each face exactly to the front, upright (no tilt). */
export const FACE_ROTATION: Record<number, readonly [number, number]> = {
  1: [0, 0],
  2: [-90, 0],
  3: [0, -90],
  4: [0, 90],
  5: [90, 0],
  6: [0, 180],
};

/** Cube transform. The -HALF z shift puts the front face on the screen plane, so a landed die is flat. */
export function dieTransform(rx: number, ry: number): string {
  return `translateZ(-${HALF}px) rotateX(${rx}deg) rotateY(${ry}deg)`;
}

const CHECKER_COLOR: Record<Player, string> = {
  p1: "border-stone-400 bg-stone-50",
  p2: "border-stone-500 bg-stone-900",
};

/** Classes for a checker disc (also used by the flying checker in animate.ts). */
export function checkerClass(player: Player): string {
  return `size-7 shrink-0 rounded-full border ${CHECKER_COLOR[player]}`;
}

function owner(count: number): Player | null {
  if (count > 0) return "p1";
  if (count < 0) return "p2";
  return null;
}

/** Play-mode extras. Replay mode passes nothing. */
export type BoardOptions = {
  /** Points (or the bar) whose top checker the human can move; they get a ring and a pointer cursor. */
  movable?: ReadonlySet<number | "bar">;
  /** Show the swap-dice button under the dice. */
  swap?: boolean;
};

function stackHtml(n: number, player: Player | null, grow: "up" | "down", movable = false): string {
  const layout = grow === "down" ? "flex-col pt-1" : "flex-col-reverse pb-1";
  const overlap = grow === "down" ? "-mt-[3px] first:mt-0" : "-mb-[3px] first:mb-0";
  const open = `<div class="stack relative z-10 flex w-full flex-1 items-center ${layout}">`;
  if (!player || n <= 0) return `${open}</div>`;
  const shown = Math.min(n, MAX_SHOWN);
  const extra =
    n > MAX_SHOWN
      ? `<span class="my-0.5 rounded bg-stone-900 px-1 text-[11px] leading-4 font-semibold text-white">${n}</span>`
      : "";
  const checkers = Array.from({ length: shown }, (_, i) => {
    const top = movable && i === shown - 1 ? "ring-2 ring-amber-400" : "";
    return `<span class="checker ${checkerClass(player)} ${overlap} ${top}"></span>`;
  }).join("");
  return `${open}${checkers}${extra}</div>`;
}

function pointHtml(position: Position, pointId: number, grow: "up" | "down", opts: BoardOptions): string {
  const v = position.points[pointId - 1] ?? 0;
  const who = owner(v);
  const n = Math.abs(v);
  const movable = opts.movable?.has(pointId) ?? false;
  const color = pointId % 2 === 1 ? "bg-rose-700" : "bg-stone-300";
  const shape =
    grow === "down"
      ? "top-[1.15rem] bottom-0 [clip-path:polygon(0_0,100%_0,50%_100%)]"
      : "top-0 bottom-[1.15rem] [clip-path:polygon(50%_0,100%_100%,0_100%)]";
  const pip = `<span class="relative z-10 py-0.5 text-center text-[11px] leading-tight text-emerald-100">${pointId}</span>`;
  const stack = stackHtml(n, who, grow, movable);
  return `<div class="relative flex min-w-0 flex-col items-center ${movable ? "cursor-pointer" : ""}" data-point="${pointId}">
    <div class="pointer-events-none absolute inset-x-[5%] ${shape} ${color}"></div>
    ${grow === "down" ? `${pip}${stack}` : `${stack}${pip}`}
  </div>`;
}

function quadHtml(
  position: Position,
  ids: readonly number[],
  grow: "up" | "down",
  place: string,
  opts: BoardOptions,
): string {
  return `<div class="grid min-w-0 grid-cols-6 ${place}">${ids.map((id) => pointHtml(position, id, grow, opts)).join("")}</div>`;
}

function cubeLabel(position: Position): string {
  const { value, owner: who } = position.cube;
  if (who === "centered") return `${value}`;
  return `${value} ${who}`;
}

const DIE_COLOR: Record<Player, { face: string; dot: string }> = {
  p1: { face: "border-stone-300 bg-white", dot: "bg-stone-900" },
  p2: { face: "border-stone-600 bg-stone-900", dot: "bg-white" },
};

function faceHtml(value: number, player: Player): string {
  const mask = PIP_MASKS[value] ?? PIP_MASKS[1]!;
  const { face, dot } = DIE_COLOR[player];
  const dots = mask
    .map((on) => `<span class="m-auto size-1.5 rounded-full ${on ? dot : "invisible"}"></span>`)
    .join("");
  return `<div class="absolute inset-0 grid grid-cols-3 grid-rows-3 rounded-[5px] border p-[5px] backface-hidden ${face}" style="transform: ${FACE_TRANSFORMS[value]}">${dots}</div>`;
}

function die3dHtml(value: number, player: Player, dim: DieDim): string {
  const faces = [1, 2, 3, 4, 5, 6].map((v) => faceHtml(v, player)).join("");
  const [rx, ry] = FACE_ROTATION[value] ?? FACE_ROTATION[1]!;
  const fade = dim === "used" ? "opacity-40" : "";
  const half =
    dim === "half"
      ? `<div class="pointer-events-none absolute inset-y-0 right-0 z-10 w-1/2 rounded-r-[5px] bg-stone-900/60"></div>`
      : "";
  return `<div class="die3d relative size-[38px] shrink-0 [perspective:400px] ${fade}" data-value="${value}">
    <div class="die-cube relative size-full transform-3d" style="transform: ${dieTransform(rx, ry)}">${faces}</div>
    ${half}
  </div>`;
}

export type DieDim = "none" | "half" | "used";

function cubeDim(spent: number): DieDim {
  if (spent <= 0) return "none";
  if (spent === 1) return "half";
  return "used";
}

/** Two cubes on screen; a double is four plays, so each cube covers two uses (half, then full). */
export function dimFlags(dice: [number, number], used: readonly number[]): [DieDim, DieDim] {
  if (dice[0] === dice[1]) {
    const n = used.filter((d) => d === dice[0]).length;
    return [cubeDim(n), cubeDim(n - 2)];
  }
  const pool = [...used];
  return dice.map((d) => {
    const i = pool.indexOf(d);
    if (i < 0) return "none";
    pool.splice(i, 1);
    return "used";
  }) as [DieDim, DieDim];
}

function diceTrayHtml(position: Position, usedDice: readonly number[], swap: boolean): string {
  if (!position.dice) return "";
  const player = position.onRoll;
  const dim = dimFlags(position.dice, usedDice);
  const place = player === "p2" ? "mb-auto pt-0.5" : "mt-auto pb-0.5";
  const swapButton = swap
    ? `<button type="button" data-action="swap" class="cursor-pointer rounded bg-stone-800 px-2 py-0.5 text-[11px] leading-4 text-white hover:bg-stone-700">Swap dice</button>`
    : "";
  return `<div class="flex flex-col items-center gap-1 ${place}">
    <div class="flex gap-3">
      ${die3dHtml(position.dice[0]!, player, dim[0])}
      ${die3dHtml(position.dice[1]!, player, dim[1])}
    </div>
    ${swapButton}
  </div>`;
}

export function actionNotice(frame: Frame): string | null {
  const ev = frame.lastEvent;
  if (!ev) return null;
  if (ev.kind === "roll" && !ev.canMove) {
    return `${ev.player} rolled ${ev.dice[0]}-${ev.dice[1]} and cannot move`;
  }
  if (ev.kind === "cube") {
    if (ev.action === "double") return `${ev.player} offered`;
    if (ev.action === "take") return `${ev.player} accepted`;
    return `${ev.player} dropped`;
  }
  return null;
}

export function renderBoard(position: Position, usedDice: readonly number[] = [], opts: BoardOptions = {}): string {
  const tray = diceTrayHtml(position, usedDice, opts.swap ?? false);
  return `<div class="grid min-h-0 flex-1 grid-cols-[1fr_52px_1fr_56px] grid-rows-[minmax(0,1fr)_76px_minmax(0,1fr)] bg-emerald-800">
    ${quadHtml(position, TOP_LEFT, "down", "col-start-1 row-start-1", opts)}
    <div class="col-start-1 row-start-2 flex flex-col items-start justify-center px-2.5">${position.onRoll === "p2" ? tray : ""}</div>
    <div class="col-start-2 row-span-3 row-start-1 flex flex-col bg-stone-800">
      <div class="flex min-h-0 w-full flex-1 items-start" data-slot="bar-p2">${stackHtml(position.bar.p2, position.bar.p2 > 0 ? "p2" : null, "down")}</div>
      <div class="flex flex-col items-center py-2">
        <div class="cube grid size-[34px] place-items-center rounded-sm bg-white text-center text-xs leading-none font-bold text-stone-900">${cubeLabel(position)}</div>
      </div>
      <div class="flex min-h-0 w-full flex-1 items-end ${opts.movable?.has("bar") ? "cursor-pointer" : ""}" data-slot="bar-p1">${stackHtml(position.bar.p1, position.bar.p1 > 0 ? "p1" : null, "up", opts.movable?.has("bar") ?? false)}</div>
    </div>
    ${quadHtml(position, TOP_RIGHT, "down", "col-start-3 row-start-1", opts)}
    <div class="col-start-3 row-start-2 flex flex-col items-end justify-center px-2.5">${position.onRoll === "p1" ? tray : ""}</div>
    <div class="col-start-4 row-span-3 row-start-1 flex flex-col bg-stone-800">
      <div class="flex min-h-0 flex-1 flex-col border-b border-stone-700" data-slot="off-p2">
        ${stackHtml(position.off.p2, position.off.p2 > 0 ? "p2" : null, "down")}
      </div>
      <div class="flex min-h-0 flex-1 flex-col border-t border-stone-700" data-slot="off-p1">
        ${stackHtml(position.off.p1, position.off.p1 > 0 ? "p1" : null, "up")}
      </div>
    </div>
    ${quadHtml(position, BOT_LEFT, "up", "col-start-1 row-start-3", opts)}
    ${quadHtml(position, BOT_RIGHT, "up", "col-start-3 row-start-3", opts)}
  </div>`;
}

function hudItem(label: string, value: string): string {
  return `<div class="flex gap-1.5"><dt class="text-stone-500">${label}</dt><dd class="font-medium">${value}</dd></div>`;
}

export function renderHud(frame: Frame, index: number, total: number): string {
  const p = frame.position;
  const may = [
    p.cube.mayDouble.p1 ? "p1" : null,
    p.cube.mayDouble.p2 ? "p2" : null,
  ]
    .filter(Boolean)
    .join(", ") || "none";
  const result = frame.result ? `${frame.result.winner} +${frame.result.points}` : "—";
  const cubeOwner = p.cube.owner === "centered" ? "centered" : p.cube.owner;
  const match = p.match
    ? `${p.match.score.p1}–${p.match.score.p2} / ${p.match.length}${p.match.crawford ? " Crawford" : ""}`
    : "money";
  return `<dl class="flex flex-wrap gap-x-5 gap-y-1.5">
    ${hudItem("Match", match)}
    ${hudItem("Players", `p1 ${frame.players.p1} · p2 ${frame.players.p2}`)}
    ${hudItem("Game", `${frame.gameIndex} · ply ${frame.eventIndex + 1}`)}
    ${hudItem("Cube", `${p.cube.value} (${cubeOwner})`)}
    ${hudItem("On roll", p.onRoll)}
    ${hudItem("May double", may)}
    ${hudItem("Result", result)}
    ${hudItem("Step", `${index + 1} / ${total}`)}
  </dl>`;
}
