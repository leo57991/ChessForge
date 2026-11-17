import {
  ReviewedGame,
  buildReview,
  phase,
  choosePositions,
} from "./weaknesses";
import { Score } from "./types";
import { identifyOpening } from "./openings";
const accounts = ["hugemudraven", "oo09080983"];
export function playerColor(d: ReviewedGame): "w" | "b" | null {
  const w = accounts.includes(d.game.white_username.toLowerCase()),
    b = accounts.includes(d.game.black_username.toLowerCase());
  return w === b ? null : w ? "w" : "b";
}
export const reportScope = (d: ReviewedGame) =>
  JSON.stringify([d.game.source, d.game.time_control]);
export function reportGames(data: ReviewedGame[]) {
  const latest = new Map<number, ReviewedGame>();
  for (const d of data) {
    if (
      d.run.status !== "completed" ||
      !["1-0", "0-1", "1/2-1/2"].includes(d.game.result) ||
      !playerColor(d) ||
      !d.moves.length
    )
      continue;
    const ids = new Set(d.analyses.map((a) => a.move_id));
    if (!d.moves.every((m) => ids.has(m.id))) continue;
    if (!latest.has(d.game.id) || latest.get(d.game.id)!.run.id < d.run.id)
      latest.set(d.game.id, d);
  }
  return [...latest.values()].sort(
    (a, b) =>
      b.game.played_at.localeCompare(a.game.played_at) || b.game.id - a.game.id,
  );
}
export function playerScore(s: Score, color: "w" | "b") {
  const white = s.mate === null ? s.cp! : s.white_wins ? 100000 : -100000;
  return white * (color === "w" ? 1 : -1);
}
export function sustainedIndex(values: number[], direction: 1 | -1) {
  return values.findIndex(
    (v, i) => i > 0 && v * direction >= 200 && values[i - 1] * direction >= 200,
  );
}
export type Metric = {
  id: string;
  label: string;
  n: number;
  d: number;
  unit: string;
  definition: string;
  advice: string;
};
export function makeReport(
  input: ReviewedGame[],
  scope: string,
  limit: number,
  color: "all" | "w" | "b" = "all",
) {
  const data = reportGames(input)
    .filter(
      (d) =>
        reportScope(d) === scope &&
        (color === "all" || playerColor(d) === color),
    )
    .slice(0, limit);
  let own = 0,
    errors = 0,
    endMoves = 0,
    endErrors = 0,
    openingN = 0,
    openingNegative = 0,
    advantageN = 0,
    converted = 0,
    behindN = 0,
    saved = 0,
    wins = 0,
    draws = 0;
  const openings = new Map<
    string,
    {
      name: string;
      color: string;
      games: number;
      wins: number;
      draws: number;
      loss: number;
      own: number;
      gameId: number;
      runId: number;
      ply: number;
    }
  >();
  const outcomes: { d: ReviewedGame; ply: number; kind: string }[] = [];
  for (const d of data) {
    const c = playerColor(d)!,
      won = d.game.result === (c === "w" ? "1-0" : "0-1"),
      draw = d.game.result === "1/2-1/2";
    wins += Number(won);
    draws += Number(draw);
    const byId = new Map(d.analyses.map((a) => [a.move_id, a])),
      moves = [...d.moves].sort((a, b) => a.ply - b.ply);
    const scores = moves.map((m) =>
      playerScore(byId.get(m.id)!.evaluation_after, c),
    );
    const ahead = sustainedIndex(scores, 1),
      behind = sustainedIndex(scores, -1);
    if (ahead >= 0) {
      advantageN++;
      converted += Number(won);
      if (!won)
        outcomes.push({ d, ply: moves[ahead].ply, kind: "曾領先，最終未贏" });
    }
    if (behind >= 0) {
      behindN++;
      saved += Number(won || draw);
      if (won || draw)
        outcomes.push({
          d,
          ply: moves[behind].ply,
          kind: "曾落後，最終保住結果",
        });
    }
    const boundary = moves.find((m) => m.ply === 20);
    if (boundary) {
      openingN++;
      openingNegative += Number(
        playerScore(byId.get(boundary.id)!.evaluation_after, c) < -100,
      );
    }
    const opening = identifyOpening(moves),
      key = c + ":" + opening.eco + ":" + opening.english + ":" + opening.name;
    const row = openings.get(key) || {
      name:
        opening.name +
        (opening.eco ? " · " + opening.eco : "") +
        (opening.english && opening.english !== opening.name
          ? " · " + opening.english
          : ""),
      color: c === "w" ? "白" : "黑",
      games: 0,
      wins: 0,
      draws: 0,
      loss: 0,
      own: 0,
      gameId: d.game.id,
      runId: d.run.id,
      ply: 1,
    };
    row.games++;
    row.wins += Number(won);
    row.draws += Number(draw);
    for (const m of moves) {
      if (m.fen_before.split(" ")[1] !== c) continue;
      const a = byId.get(m.id)!,
        bad = ["Mistake", "Blunder"].includes(a.classification);
      own++;
      errors += Number(bad);
      if (phase(m) === "endgame") {
        endMoves++;
        endErrors += Number(bad);
      }
      if (m.ply <= 20) {
        row.own++;
        row.loss += a.win_chance_loss;
        if (bad) {
          row.gameId = d.game.id;
          row.runId = d.run.id;
          row.ply = m.ply;
        }
      }
    }
    openings.set(key, row);
  }
  const metrics: Metric[] = [
    {
      id: "opening",
      label: "開局銜接",
      n: openingNegative,
      d: openingN,
      unit: "盤在第 10 回合後落後超過 1 兵",
      definition:
        "只計有第 20 半步評估的棋局，以你的視角計算；較早結束的棋局不列入。",
      advice: "回看最早的中央兵交換與輕子發展，找出開始落後的位置。",
    },
    {
      id: "mistakes",
      label: "失誤控制",
      n: errors,
      d: own,
      unit: "步為錯誤或嚴重失誤",
      definition:
        "只統計你的走法，按 ChessForge 引擎損失標籤計算；不等同戰術能力分數。",
      advice: "落子前依序檢查對手的將軍、吃子與直接威脅。",
    },
    {
      id: "conversion",
      label: "優勢兌現",
      n: converted,
      d: advantageN,
      unit: "盤曾明顯領先後獲勝",
      definition:
        "連續兩個半步評估至少領先 2 兵（含有利將死）；每盤只計一次，最終和棋不算獲勝。",
      advice: "先復盤曾領先卻沒贏的棋局，確認何時失去優勢。",
    },
    {
      id: "recovery",
      label: "劣勢挽救",
      n: saved,
      d: behindN,
      unit: "盤曾明顯落後後取得勝或和",
      definition:
        "連續兩個半步評估至少落後 2 兵（含不利將死）；結果不代表每次挽救都是主動反擊。",
      advice: "看劣勢時有沒有漏掉安全的防守或對手提供的機會。",
    },
    {
      id: "endgame",
      label: "殘局決策",
      n: endErrors,
      d: endMoves,
      unit: "個殘局走法出現錯誤或嚴重失誤",
      definition:
        "沿用復盤的簡化殘局規則：非兵非王棋子不超過 4 枚，或無后且不超過 6 枚；不包含全部殘局形態。",
      advice: "先檢查王的活動、通路兵，以及是否意外形成逼和。",
    },
  ];
  const review = buildReview(data);
  const rate = (ds: ReviewedGame[]) => {
    let n = 0,
      total = 0;
    for (const d of ds) {
      const c = playerColor(d);
      for (const m of d.moves) {
        if (m.fen_before.split(" ")[1] !== c) continue;
        const a = d.analyses.find((a) => a.move_id === m.id);
        if (a) {
          total++;
          n += Number(["Mistake", "Blunder"].includes(a.classification));
        }
      }
    }
    return {
      games: ds.length,
      moves: total,
      errors: n,
      rate: total ? (100 * n) / total : null,
    };
  };
  return {
    data,
    scope,
    color,
    own,
    errors,
    wins,
    draws,
    metrics,
    openings: [...openings.values()].sort((a, b) => b.games - a.games),
    picks: choosePositions(review.positions, 3),
    priorities: review.groups.filter((g) => g.count).slice(0, 3),
    outcomes: outcomes.slice(0, 4),
    recent: rate(data.slice(0, 10)),
    previous: rate(data.slice(10, 20)),
    engines: [
      ...new Set(
        data.map(
          (d) =>
            `${d.run.engine_version} · 深度上限 ${d.run.depth} · MultiPV ${d.run.multipv}`,
        ),
      ),
    ],
  };
}
export function reportMarkdown(r: ReturnType<typeof makeReport>) {
  return (
    `# ChessForge 個人分析報告\n\n產生日期：${new Date().toLocaleDateString("zh-TW")}\n\n範圍：${r.scope}；執棋：${r.color}。已完成分析 ${r.data.length} 盤，${r.own} 個己方走法；${r.wins} 勝 ${r.draws} 和 ${r.data.length - r.wins - r.draws} 負。\n\n樣本期間：${r.data[r.data.length - 1]?.game.played_at || "無"} ～ ${r.data[0]?.game.played_at || "無"}。這是已分析樣本，不代表所有對局；未與同分段棋手比較。\n\n` +
    r.metrics
      .map(
        (m) =>
          `## ${m.label}\n\n${m.d ? `${m.n}/${m.d} ${m.unit}` : "沒有足夠資料"}\n\n定義：${m.definition}\n\n練習：${m.advice}\n`,
      )
      .join("\n") +
    `\n## 優先改善\n\n` +
    r.priorities
      .map(
        (g) => `- ${g.name}：${g.count} 個局面，來自 ${g.games} 盤。${g.tip}`,
      )
      .join("\n") +
    `\n\n## 對應棋步\n\n` +
    r.picks
      .map(
        (p) =>
          `- ${p.game.played_at} ${p.game.white_username} vs ${p.game.black_username}：第 ${Math.ceil(p.move.ply / 2)} 回合 ${p.move.san} → ${p.analysis.best_move_san}（game ${p.game.id}, ply ${p.move.ply}, run ${p.runId}）。${p.evidence}`,
      )
      .join("\n") +
    "\n\n## 常見開局\n\n" +
    r.openings
      .map(
        (o) =>
          `- 執${o.color} ${o.name}：${o.games} 盤，${o.wins} 勝 ${o.draws} 和；開局平均估計勝算損失 ${o.own ? (o.loss / o.own).toFixed(1) : "—"} 個百分點／步。`,
      )
      .join("\n") +
    `\n\n## 限制\n\n時間管理尚未評分：目前報告未擷取及驗證逐步時鐘。小樣本與不同引擎設定會影響結果，速覽需再深入確認；沒有虛構 Elo、同儕排名或綜合能力分數。\n\n引擎：${r.engines.join("；")}\n`
  );
}
