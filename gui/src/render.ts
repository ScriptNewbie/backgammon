import type { Frame } from "./types";

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

function hudItem(label: string, value: string): string {
  return `<div class="flex gap-1.5"><dt class="text-stone-500">${label}</dt><dd class="font-medium">${value}</dd></div>`;
}

export function renderHud(frame: Frame, index: number, total: number): string {
  const p = frame.position;
  const may =
    [p.cube.mayDouble.p1 ? "p1" : null, p.cube.mayDouble.p2 ? "p2" : null].filter(Boolean).join(", ") || "none";
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
