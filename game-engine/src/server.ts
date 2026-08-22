import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadOnnx } from "./infer";

const modelPath = process.env.MODEL_PATH ?? "/models/cubeless.onnx";
const infer = await loadOnnx(modelPath);
const app = createApp(infer);

serve({ fetch: app.fetch, hostname: "0.0.0.0", port: 3000 });
console.log(`game-engine listening on :3000 model=${modelPath}`);
