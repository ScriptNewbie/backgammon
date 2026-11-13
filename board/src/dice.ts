import type { Player } from "ts-core";

/** Half the die edge (38px die); faces sit at ±HALF on each axis. */
export const HALF = 19;

const PIP_MASKS: Record<number, boolean[]> = {
  1: [false, false, false, false, true, false, false, false, false],
  2: [true, false, false, false, false, false, false, false, true],
  3: [true, false, false, false, true, false, false, false, true],
  4: [true, false, true, false, false, false, true, false, true],
  5: [true, false, true, false, true, false, true, false, true],
  6: [true, false, true, true, false, true, true, false, true],
};

/** Where each face sits on the cube. */
export const FACE_TRANSFORMS: Record<number, string> = {
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

export function pipMask(value: number): boolean[] {
  return PIP_MASKS[value] ?? PIP_MASKS[1]!;
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

const ROLL_MS = 650;

/**
 * Spin each die one full turn on both axes and settle on its face.
 * Start and end differ by whole turns, so the last frame equals the resting
 * transform: the die lands flat, upright, with no tilt.
 */
export function rollDice(root: HTMLElement): Promise<void> {
  const done: Promise<unknown>[] = [];
  root.querySelectorAll<HTMLElement>(".bb-die").forEach((die, i) => {
    const cube = die.querySelector<HTMLElement>(".bb-die-cube");
    const [rx, ry] = FACE_ROTATION[Number(die.dataset.value)] ?? FACE_ROTATION[1]!;
    if (!cube) return;
    const dir = i % 2 === 0 ? 1 : -1;
    const anim = cube.animate(
      [
        { transform: dieTransform(rx - 360 * dir, ry + 360 * dir) },
        { transform: dieTransform(rx, ry) },
      ],
      { duration: ROLL_MS, delay: i * 40, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)", fill: "backwards" },
    );
    done.push(anim.finished.catch(() => undefined));
  });
  return Promise.all(done).then(() => undefined);
}

export function pulseCube(root: HTMLElement): Promise<void> {
  const cube = root.querySelector<HTMLElement>(".bb-cube");
  if (!cube) return Promise.resolve();
  const anim = cube.animate([{ transform: "scale(1)" }, { transform: "scale(1.15)" }, { transform: "scale(1)" }], {
    duration: 300,
    easing: "ease-out",
  });
  return anim.finished.then(() => undefined).catch(() => undefined);
}

export function checkerClass(player: Player): string {
  return `bb-checker bb-checker-${player}`;
}
