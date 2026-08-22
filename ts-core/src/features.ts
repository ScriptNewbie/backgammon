import type { Position } from "./types";

export const FEATURE_SIZE = 206;

function encodeCount(n: number, out: Float32Array, offset: number): void {
  out[offset] = n >= 1 ? 1 : 0;
  out[offset + 1] = n >= 2 ? 1 : 0;
  out[offset + 2] = n >= 3 ? 1 : 0;
  out[offset + 3] = n > 3 ? (n - 3) / 2 : 0;
}

/** Position JSON → length-206 float32 STM vector (docs/domain/features.md). */
export function featurize(position: Position): Float32Array {
  const onRoll = position.onRoll;
  if (onRoll !== "p1" && onRoll !== "p2") {
    throw new Error(`onRoll must be p1 or p2, got ${String(onRoll)}`);
  }
  const vec = new Float32Array(FEATURE_SIZE);
  const stm = onRoll;
  const opp = onRoll === "p1" ? "p2" : "p1";
  const points = position.points;

  for (let k = 0; k < 24; k++) {
    let stmN: number;
    let oppN: number;
    if (onRoll === "p1") {
      const raw = points[k]!;
      stmN = Math.max(raw, 0);
      oppN = Math.max(-raw, 0);
    } else {
      const raw = points[23 - k]!;
      stmN = Math.max(-raw, 0);
      oppN = Math.max(raw, 0);
    }
    encodeCount(stmN, vec, k * 4);
    encodeCount(oppN, vec, 96 + k * 4);
  }

  vec[192] = position.bar[stm] / 2;
  vec[193] = position.bar[opp] / 2;
  vec[194] = position.off[stm] / 15;
  vec[195] = position.off[opp] / 15;

  const cube = position.cube;
  vec[196] = Math.log2(cube.value) / 6;
  const owner = cube.owner;
  vec[197] = owner === "centered" ? 1 : 0;
  vec[198] = owner === stm ? 1 : 0;
  vec[199] = owner === opp ? 1 : 0;
  vec[200] = cube.mayDouble[stm] ? 1 : 0;
  vec[201] = cube.mayDouble[opp] ? 1 : 0;
  return vec;
}
