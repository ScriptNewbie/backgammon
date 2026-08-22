import { parseCheckerMove, type Player, type SgfEvent, type SgfGame } from "ts-core";

function propValues(tree: string, name: string): string[] {
  const re = new RegExp(`${name}((?:\\[[^\\]]*\\])+)`, "m");
  const m = tree.match(re);
  if (!m) return [];
  return [...m[1]!.matchAll(/\[([^\]]*)\]/g)].map((x) => x[1]!);
}

function miField(values: string[], key: string): number {
  const row = values.find((v) => v.startsWith(`${key}:`));
  if (!row) throw new Error(`SGF MI missing ${key}`);
  const n = Number(row.slice(key.length + 1));
  if (!Number.isInteger(n) || n < 0) throw new Error(`SGF MI bad ${key}`);
  return n;
}

function playerFromColor(color: string): Player {
  if (color === "W") return "p1";
  if (color === "B") return "p2";
  throw new Error(`SGF color ${color}`);
}

function levelLabel(raw: string, prefix: "p1" | "p2"): string {
  const p = `${prefix}-`;
  return raw.startsWith(p) ? raw.slice(p.length) : raw;
}

function phaseFromRu(ru: string | undefined, length: number, score: { p1: number; p2: number }): SgfGame["phase"] {
  if (ru?.includes("CrawfordGame") || length === 1) return "crawford";
  if (score.p1 === length - 1 || score.p2 === length - 1) return "post";
  return "pre";
}

function parseResult(raw: string | undefined): SgfGame["result"] {
  if (!raw || raw === "0") return null;
  const m = raw.match(/^([WB])\+(\d+)$/);
  if (!m) throw new Error(`SGF RE ${raw}`);
  return { winner: playerFromColor(m[1]!), points: Number(m[2]) };
}

function parseEvent(color: string, value: string): SgfEvent {
  const player = playerFromColor(color);
  if (value === "double" || value === "take" || value === "drop") {
    return { kind: "cube", player, action: value };
  }
  const { dice, steps } = parseCheckerMove(value);
  return { kind: "move", player, dice, steps };
}

function parseGameTree(tree: string): SgfGame {
  const gm = propValues(tree, "GM")[0];
  if (gm !== undefined && gm !== "6") throw new Error(`SGF GM[${gm}] is not backgammon`);

  const mi = propValues(tree, "MI");
  const length = miField(mi, "length");
  const gameIndex = miField(mi, "game");
  const ws = miField(mi, "ws");
  const bs = miField(mi, "bs");
  const score = { p1: ws, p2: bs };
  const ru = propValues(tree, "RU")[0];
  const pw = propValues(tree, "PW")[0] ?? "p1";
  const pb = propValues(tree, "PB")[0] ?? "p2";
  const events: SgfEvent[] = [];
  for (const m of tree.matchAll(/;([WB])\[([^\]]*)\]/g)) {
    events.push(parseEvent(m[1]!, m[2]!));
  }
  return {
    length,
    gameIndex,
    ws,
    bs,
    p1: levelLabel(pw, "p1"),
    p2: levelLabel(pb, "p2"),
    phase: phaseFromRu(ru, length, score),
    events,
    result: parseResult(propValues(tree, "RE")[0]),
  };
}

/** Parse concatenated GNU Backgammon GM[6] game trees as emitted by move-dumper. */
export function parseMatchSgf(text: string): SgfGame[] {
  const trees = [...text.matchAll(/\(;([\s\S]*?)\)/g)].map((m) => m[1]!);
  if (trees.length === 0) throw new Error("no SGF game trees");
  return trees.map(parseGameTree);
}
