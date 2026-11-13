import {
  applySteps,
  clonePosition,
  generateLegalSequences,
  openingPosition,
  positionToXgid,
  type Position,
} from "ts-core";
import "./element";

const el = document.querySelector("backgammon-board") as HTMLElement & { xgid: string };
let pos: Position = openingPosition(5, { p1: 0, p2: 0 }, "pre");

function show(): void {
  el.xgid = positionToXgid(pos);
}

show();

document.querySelector("#roll")!.addEventListener("click", () => {
  const faces: [number, number] = pos.dice?.[0] === 3 ? [6, 5] : [3, 1];
  pos = clonePosition(pos);
  pos.dice = faces;
  show();
});

document.querySelector("#step")!.addEventListener("click", () => {
  if (!pos.dice) return;
  const step = generateLegalSequences(pos)[0]?.steps[0];
  if (!step) return;
  pos = applySteps(pos, [step]);
  show();
});

document.querySelector("#reset")!.addEventListener("click", () => {
  pos = openingPosition(5, { p1: 0, p2: 0 }, "pre");
  show();
});
