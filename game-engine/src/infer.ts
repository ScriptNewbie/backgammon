import { InferenceSession, Tensor } from "onnxruntime-node";
import { FEATURE_SIZE } from "ts-core";
import type { Infer } from "./evaluate";

export async function loadOnnx(modelPath: string): Promise<Infer> {
  const session = await InferenceSession.create(modelPath);
  return {
    async infer(features: Float32Array[]): Promise<Float32Array[]> {
      const rows: Float32Array[] = [];
      for (const row of features) {
        if (row.length !== FEATURE_SIZE) {
          throw new Error(`feature length ${row.length}, expected ${FEATURE_SIZE}`);
        }
        // Export is frozen at batch 1 (no dynamic_axes).
        const tensor = new Tensor("float32", row, [1, FEATURE_SIZE]);
        const out = await session.run({ features: tensor });
        const cubeless = out.cubeless;
        if (!cubeless) throw new Error("ONNX output cubeless missing");
        const arr = cubeless.data as Float32Array;
        rows.push(Float32Array.from(arr.subarray(0, 5)));
      }
      return rows;
    },
  };
}
