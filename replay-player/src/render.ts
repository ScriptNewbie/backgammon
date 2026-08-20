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

function owner(count: number): Player | null {
  if (count > 0) return "p1";
  if (count < 0) return "p2";
  return null;
}

function stackHtml(n: number, player: Player | null, grow: "up" | "down"): string {
  if (!player || n <= 0) return `<div class="stack ${grow}"></div>`;
  const shown = Math.min(n, 8);
  const extra = n > 8 ? `<span class="count">${n}</span>` : "";
  const checkers = Array.from({ length: shown }, () => `<span class="checker ${player}"></span>`).join("");
  return `<div class="stack ${grow}">${checkers}${extra}</div>`;
}

function pointHtml(position: Position, pointId: number, grow: "up" | "down"): string {
  const v = position.points[pointId - 1] ?? 0;
  const who = owner(v);
  const n = Math.abs(v);
  const shade = pointId % 2 === 1 ? "dark" : "light";
  const pip = `<span class="pip">${pointId}</span>`;
  const stack = stackHtml(n, who, grow);
  return `<div class="point ${shade} ${grow}" data-point="${pointId}">
    <div class="triangle"></div>
    ${grow === "down" ? `${pip}${stack}` : `${stack}${pip}`}
  </div>`;
}

function quadHtml(position: Position, ids: readonly number[], grow: "up" | "down", area: string): string {
  return `<div class="quad ${grow} ${area}">${ids.map((id) => pointHtml(position, id, grow)).join("")}</div>`;
}

function cubeLabel(position: Position): string {
  const { value, owner: who } = position.cube;
  if (who === "centered") return `${value}`;
  return `${value} ${who}`;
}

function faceHtml(value: number): string {
  const mask = PIP_MASKS[value] ?? PIP_MASKS[1]!;
  const names = ["one", "two", "three", "four", "five", "six"];
  const dots = mask.map((on) => `<span class="pip-dot${on ? " on" : ""}"></span>`).join("");
  return `<div class="face ${names[value - 1]}">${dots}</div>`;
}

function die3dHtml(value: number, player: Player, rolling: boolean, dim: DieDim): string {
  const faces = [1, 2, 3, 4, 5, 6].map(faceHtml).join("");
  const dimClass = dim === "used" ? " used" : dim === "half" ? " half-used" : "";
  const extra = `${rolling ? " rolling" : ""}${dimClass}`;
  return `<div class="die3d ${player} show-${value}${extra}">
    <div class="die-cube">${faces}</div>
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

function diceTrayHtml(position: Position, rolling: boolean, usedDice: readonly number[]): string {
  if (!position.dice) return "";
  const player = position.onRoll;
  const dim = dimFlags(position.dice, usedDice);
  return `<div class="dice-tray ${player}">
    ${die3dHtml(position.dice[0]!, player, rolling, dim[0])}
    ${die3dHtml(position.dice[1]!, player, rolling, dim[1])}
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

export function renderBoard(position: Position, rolling = false, usedDice: readonly number[] = []): string {
  const tray = diceTrayHtml(position, rolling, usedDice);
  return `<div class="felt">
    ${quadHtml(position, TOP_LEFT, "down", "tl")}
    <div class="gutter ml">${position.onRoll === "p2" ? tray : ""}</div>
    <div class="bar">
      <div class="bar-half top" data-slot="bar-p2">${stackHtml(position.bar.p2, position.bar.p2 > 0 ? "p2" : null, "down")}</div>
      <div class="bar-mid">
        <div class="cube">${cubeLabel(position)}</div>
      </div>
      <div class="bar-half bottom" data-slot="bar-p1">${stackHtml(position.bar.p1, position.bar.p1 > 0 ? "p1" : null, "up")}</div>
    </div>
    ${quadHtml(position, TOP_RIGHT, "down", "tr")}
    <div class="gutter mr">${position.onRoll === "p1" ? tray : ""}</div>
    <div class="off">
      <div class="off-tray top" data-slot="off-p2">
        ${stackHtml(position.off.p2, position.off.p2 > 0 ? "p2" : null, "down")}
      </div>
      <div class="off-tray bottom" data-slot="off-p1">
        ${stackHtml(position.off.p1, position.off.p1 > 0 ? "p1" : null, "up")}
      </div>
    </div>
    ${quadHtml(position, BOT_LEFT, "up", "bl")}
    ${quadHtml(position, BOT_RIGHT, "up", "br")}
  </div>`;
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
  return `<dl>
    <div><dt>Match</dt><dd>${p.match.score.p1}–${p.match.score.p2} / ${p.match.length}${p.match.crawford ? " Crawford" : ""}</dd></div>
    <div><dt>Players</dt><dd>p1 ${frame.players.p1} · p2 ${frame.players.p2}</dd></div>
    <div><dt>Game</dt><dd>${frame.gameIndex} · ply ${frame.eventIndex + 1}</dd></div>
    <div><dt>Cube</dt><dd>${p.cube.value} (${cubeOwner})</dd></div>
    <div><dt>On roll</dt><dd>${p.onRoll}</dd></div>
    <div><dt>May double</dt><dd>${may}</dd></div>
    <div><dt>Result</dt><dd>${result}</dd></div>
    <div><dt>Step</dt><dd>${index + 1} / ${total}</dd></div>
  </dl>`;
}
