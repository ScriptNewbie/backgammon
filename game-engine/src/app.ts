import { Hono } from "hono";
import { evaluatePosition, type Infer } from "./evaluate";
import { parseEvaluateBody } from "./validate";

export function createApp(infer: Infer): Hono {
  const app = new Hono();
  app.get("/health", (c) => c.json({ ok: true }));
  app.post("/evaluate", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid json" }, 400);
    }
    try {
      const position = parseEvaluateBody(body);
      return c.json(await evaluatePosition(position, infer));
    } catch (err) {
      const message = err instanceof Error ? err.message : "invalid position";
      return c.json({ error: message }, 400);
    }
  });
  return app;
}
