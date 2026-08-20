import type { Cubeless, Eval, LegalPlay, Player, Position, Step } from "./types";
import { parsePoint, stepsKey } from "./board";

export type BgwebLayout = Record<string, number>;

export type BgwebBoard = {
  x: BgwebLayout;
  o: BgwebLayout;
};

export type BgwebPlay = { from: string; to: string };

export type BgwebProbability = {
  win: number;
  winG: number;
  winBG: number;
  lose: number;
  loseG: number;
  loseBG: number;
};

export type BgwebEvaluation = {
  eq: number;
  diff: number;
  info?: { cubeful: boolean; plies: number };
  probability: BgwebProbability;
};

export type BgwebMove = {
  play?: BgwebPlay[] | null;
  evaluation?: BgwebEvaluation;
};

export type GetMovesArgs = {
  board: BgwebBoard;
  cubeful: boolean;
  dice: [number, number];
  player: "x" | "o";
  "score-moves": true;
};

export function toBgwebBoard(position: Position): BgwebBoard {
  const x: BgwebLayout = {};
  const o: BgwebLayout = {};
  for (let n = 1; n <= 24; n++) {
    const v = position.points[n - 1]!;
    if (v > 0) x[String(n)] = v;
    if (v < 0) o[String(25 - n)] = -v;
  }
  if (position.bar.p1 > 0) x.bar = position.bar.p1;
  if (position.bar.p2 > 0) o.bar = position.bar.p2;
  return { x, o };
}

export function playerToBgweb(onRoll: Player): "x" | "o" {
  return onRoll === "p1" ? "x" : "o";
}

export function flipPoint(onRoll: Player, raw: string): Step["from"] | Step["to"] {
  const point = parsePoint(raw);
  if (point === "bar" || point === "off") return point;
  return onRoll === "p1" ? point : 25 - point;
}

export function convertPlay(onRoll: Player, play: readonly BgwebPlay[] | null | undefined): Step[] {
  if (!play || play.length === 0) return [];
  return play.map((step) => ({
    from: flipPoint(onRoll, step.from) as Step["from"],
    to: flipPoint(onRoll, step.to) as Step["to"],
  }));
}

export function flipCubeless(moverEq: number, probability: BgwebProbability): Cubeless {
  return {
    equity: -moverEq,
    win: probability.lose,
    gammon: probability.loseG,
    backgammon: probability.loseBG,
    loseGammon: probability.winG,
    loseBackgammon: probability.winBG,
  };
}

export function flipStmCubeless(cubeless: Cubeless): Cubeless {
  return {
    equity: -cubeless.equity,
    win: 1 - cubeless.win,
    gammon: cubeless.loseGammon,
    backgammon: cubeless.loseBackgammon,
    loseGammon: cubeless.gammon,
    loseBackgammon: cubeless.backgammon,
  };
}

export function toRequest(position: Position, cubeful: boolean): GetMovesArgs {
  if (!position.dice) throw new Error("getmoves requires dice");
  return {
    board: toBgwebBoard(position),
    cubeful,
    dice: position.dice,
    player: playerToBgweb(position.onRoll),
    "score-moves": true,
  };
}

export function mergePlays(
  onRoll: Player,
  cubelessMoves: readonly BgwebMove[],
  cubefulMoves: readonly BgwebMove[],
): { plays: LegalPlay[]; plies: number | undefined } {
  const cubefulEq = new Map<string, number>();
  for (const move of cubefulMoves) {
    const steps = convertPlay(onRoll, move.play);
    if (move.evaluation) cubefulEq.set(stepsKey(steps), move.evaluation.eq);
  }
  let plies: number | undefined;
  const plays: LegalPlay[] = [];
  for (const move of cubelessMoves) {
    const steps = convertPlay(onRoll, move.play);
    const evaluation = move.evaluation;
    if (!evaluation?.probability) {
      plays.push({
        steps,
        teacherDiff: 0,
        eval: {
          cubeless: {
            equity: 0,
            win: 0.5,
            gammon: 0,
            backgammon: 0,
            loseGammon: 0,
            loseBackgammon: 0,
          },
          cubefulEquity: 0,
          cubeAction: null,
          source: "bgweb-api",
        },
      });
      continue;
    }
    if (evaluation.info?.plies !== undefined) plies = evaluation.info.plies;
    const moverCubeful = cubefulEq.get(stepsKey(steps));
    const evalObj: Eval = {
      cubeless: flipCubeless(evaluation.eq, evaluation.probability),
      cubefulEquity: moverCubeful === undefined ? 0 : -moverCubeful,
      cubeAction: null,
      source: "bgweb-api",
    };
    plays.push({ steps, eval: evalObj, teacherDiff: evaluation.diff });
  }
  return { plays, plies };
}

export class BgwebClient {
  constructor(readonly baseUrl: string) {}

  async getMoves(position: Position): Promise<{ plays: LegalPlay[]; plies: number | undefined }> {
    const [cubeless, cubeful] = await Promise.all([
      this.post(toRequest(position, false)),
      this.post(toRequest(position, true)),
    ]);
    return mergePlays(position.onRoll, cubeless, cubeful);
  }

  async healthCheck(): Promise<void> {
    const body: GetMovesArgs = {
      board: {
        x: { "6": 5, "8": 3, "13": 5, "24": 2 },
        o: { "6": 5, "8": 3, "13": 5, "24": 2 },
      },
      cubeful: false,
      dice: [3, 1],
      player: "x",
      "score-moves": true,
    };
    await this.post(body, true);
  }

  private async post(body: GetMovesArgs, limitMoves = false): Promise<BgwebMove[]> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/api/v1/getmoves`;
    const payload: GetMovesArgs & { "max-moves"?: number } = { ...body };
    if (limitMoves) payload["max-moves"] = 1;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        `bgweb-api is not reachable at ${this.baseUrl} (${reason}). From move-dumper/, run docker compose up -d. Do not use the gnubg CLI.`,
      );
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`getmoves ${res.status}: ${text.slice(0, 500)}`);
    }
    return (await res.json()) as BgwebMove[];
  }
}
