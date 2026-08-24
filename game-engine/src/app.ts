import { Hono, type MiddlewareHandler } from "hono";
import { evaluatePosition, type Infer } from "./evaluate";
import { parseEvaluateBody } from "./validate";

export type RequestLog = (line: string) => void;

type EngineEnv = {
  Variables: {
    requestLogExtra?: string;
  };
};

function requestLog(log: RequestLog): MiddlewareHandler<EngineEnv> {
  return async (c, next) => {
    const t0 = Date.now();
    await next();
    const ms = Date.now() - t0;
    const extra = c.get("requestLogExtra");
    log(`${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms${extra ? ` ${extra}` : ""}`);
  };
}

export function createApp(infer: Infer, log: RequestLog = (line) => console.log(line)): Hono<EngineEnv> {
  const app = new Hono<EngineEnv>();
  app.use(requestLog(log));
  app.get("/health", (c) => c.json({ ok: true }));
  app.post("/evaluate", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      c.set("requestLogExtra", "error=invalid json");
      return c.json({ error: "invalid json" }, 400);
    }
    try {
      const position = parseEvaluateBody(body);
      const result = await evaluatePosition(position, infer);
      const dice = position.dice ?? [0, 0];
      c.set(
        "requestLogExtra",
        `moves=${result.moves.length} onRoll=${position.onRoll} dice=${dice[0]}-${dice[1]}`,
      );
      return c.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "invalid position";
      c.set("requestLogExtra", `error=${message}`);
      return c.json({ error: message }, 400);
    }
  });
  return app;
}
