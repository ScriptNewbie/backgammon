/** HTTP helpers shared by the sidecar clients (gnubg, Hedgehog). */

export const FETCH_TIMEOUT_MS = 60_000;
export const RETRY_MAX_DELAY_MS = 30_000;

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function retryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Retry transient sidecar failures indefinitely (multi-day dumps). 4xx is fatal. `name` labels
 * the log lines and the thrown error.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  deps: {
    fetch?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    log?: (msg: string) => void;
    name?: string;
    hint?: string;
    /** Per-attempt timeout when `init.signal` is not set. */
    timeoutMs?: number;
  } = {},
): Promise<Response> {
  const doFetch = deps.fetch ?? fetch;
  const doSleep = deps.sleep ?? sleep;
  const log = deps.log ?? ((msg) => console.error(msg));
  const name = deps.name ?? "sidecar";
  const hint = deps.hint ? ` ${deps.hint}` : "";
  let delay = 1000;
  for (;;) {
    let res: Response;
    try {
      res = await doFetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(deps.timeoutMs ?? FETCH_TIMEOUT_MS) });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      log(`${name} unreachable (${reason}); retry in ${delay}ms.${hint}`);
      await doSleep(delay);
      delay = Math.min(delay * 2, RETRY_MAX_DELAY_MS);
      continue;
    }
    if (res.ok) return res;
    const text = await res.text();
    if (retryableStatus(res.status)) {
      log(`${name} ${res.status}; retry in ${delay}ms: ${text.slice(0, 200)}`);
      await doSleep(delay);
      delay = Math.min(delay * 2, RETRY_MAX_DELAY_MS);
      continue;
    }
    throw new Error(`${name} ${res.status}: ${text.slice(0, 500)}`);
  }
}
