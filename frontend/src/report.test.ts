import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { ReviewedGame } from "./weaknesses";
import {
  makeReport,
  playerScore,
  reportGames,
  reportScope,
  reportMarkdown,
  sustainedIndex,
} from "./report";
function sample(id = 1, black = false, cp = 0, result = "1-0"): ReviewedGame {
  const b = new Chess();
  const sans =
    "e4 e5 Nf3 Nc6 Bc4 Bc5 d3 d6 Nc3 Nf6 Bg5 h6 Bh4 g5 Bg3 Bg4 h3 Bh5 a3 a6".split(
      " ",
    );
  const moves = sans.map((san, i) => {
    const before = b.fen(),
      m = b.move(san);
    return {
      id: id * 100 + i,
      game_id: id,
      ply: i + 1,
      san,
      uci: m.from + m.to,
      fen_before: before,
      fen_after: b.fen(),
      flags: {},
    };
  });
  const score = { cp, mate: null, white_wins: cp > 0, depth: 12 };
  return {
    game: {
      id,
      white_username: black ? "Other" : "Hugemudraven",
      black_username: black ? "Hugemudraven" : "Other",
      played_at: "2026.11.01",
      result,
      time_control: "600",
      source: "chesscom",
      pgn: "",
    },
    moves,
    run: {
      id,
      game_id: id,
      status: "completed",
      depth: 12,
      multipv: 3,
      engine_version: "unit fixture",
      progress: 20,
      total: 20,
      limits: { seconds_per_position: 0.15 },
    },
    analyses: moves.map((m, i) => ({
      move_id: m.id,
      evaluation_before: score,
      evaluation_after: score,
      best_move_uci: m.uci,
      best_move_san: m.san,
      score_loss: 0,
      win_chance_loss: i === 0 ? 10 : 0,
      classification: i === 0 ? "Mistake" : "Good",
      explanation: "fixture",
      recommendation: "fixture",
      principal_variation: [],
      actual_variation: [],
      candidates: [],
    })),
  };
}
describe("personal report evidence", () => {
  it("counts only completed, complete, owned games and latest run per game", () => {
    const d = sample(),
      newer = { ...d, run: { ...d.run, id: 9 } };
    expect(
      reportGames([
        d,
        newer,
        { ...sample(2), run: { ...d.run, status: "cancelled" } },
        { ...sample(3), analyses: [] },
      ]),
    ).toEqual([newer]);
    expect(
      reportGames([{ ...d, game: { ...d.game, white_username: "Other" } }]),
    ).toEqual([]);
  });
  it("separates platform/time control/color and only counts player moves", () => {
    const d = sample(),
      b = sample(2, true),
      other = {
        ...sample(3),
        game: { ...sample(3).game, time_control: "180" },
      };
    const r = makeReport([d, b, other], reportScope(d), 40);
    expect(r.own).toBe(20);
    expect(r.errors).toBe(1);
    expect(r.data).toHaveLength(2);
    expect(makeReport([d, b], reportScope(d), 40, "b").errors).toBe(0);
  });
  it("converts scores and mate results to the player perspective", () => {
    expect(
      playerScore({ cp: 200, mate: null, white_wins: true, depth: 8 }, "b"),
    ).toBe(-200);
    expect(
      playerScore({ cp: null, mate: 0, white_wins: false, depth: 0 }, "b"),
    ).toBeGreaterThan(200);
    expect(sustainedIndex([0, 250, 0, 300], 1)).toBe(-1);
  });
  it("distinguishes black advantage conversion and rescue outcomes", () => {
    const ahead = sample(1, true, -300, "0-1"),
      behind = sample(2, true, 300, "1/2-1/2");
    const r = makeReport([ahead, behind], reportScope(ahead), 40);
    expect(r.metrics.find((m) => m.id === "conversion")).toMatchObject({
      n: 1,
      d: 1,
    });
    expect(r.metrics.find((m) => m.id === "recovery")).toMatchObject({
      n: 1,
      d: 1,
    });
    expect(r.metrics.find((m) => m.id === "opening")).toMatchObject({
      n: 1,
      d: 2,
    });
  });
  it("excludes short games from the move ten metric and exposes missing data", () => {
    const d = sample();
    d.moves = d.moves.slice(0, 4);
    d.analyses = d.analyses.slice(0, 4);
    const r = makeReport([d], reportScope(d), 40);
    expect(r.metrics.find((m) => m.id === "opening")!.d).toBe(0);
    expect(r.metrics.find((m) => m.id === "endgame")!.d).toBe(0);
    expect(reportMarkdown(r)).toContain("時間管理尚未評分");
    expect(reportMarkdown(r)).toContain("game 1, ply 1, run 1");
  });
});

import { openingAt15, overviewAxes } from "./reportMetrics";
it("opening checkpoint excludes short games and mates from cp averages, flips black POV", () => {
  const w = sample(1, false, 100),
    b = sample(2, true, -200),
    mate = sample(3);
  for (const d of [w, b, mate]) d.moves[d.moves.length - 1].ply = 30;
  mate.analyses[mate.analyses.length - 1].evaluation_after = {
    cp: null,
    mate: 2,
    white_wins: true,
    depth: 12,
  };
  const x = openingAt15([w, b, mate, sample(4)]);
  expect(x.groups[0]).toMatchObject({ n: 3, mates: 1, mean: 1.5 });
  expect(x.groups[2]).toMatchObject({ n: 1, mean: 2 });
  expect(openingAt15([]).groups[0].mean).toBeNull();
});
it("overview uses documented rates and does not draw missing evidence as zero", () => {
  const d = sample(),
    r = makeReport([d], reportScope(d), 40),
    a = overviewAxes(r);
  expect(a.find((x) => x.id === "mistakes")?.score).toBe(90);
  expect(a.find((x) => x.id === "conversion")?.score).toBeNull();
});

import { selectReportGames } from "./reportSelection";
it("全部報告包含不同來源與時制，保留分組篩選能力", () => {
  const a = sample(1),
    b = sample(2, true);
  b.game.source = "lichess";
  b.game.time_control = "180";
  expect(makeReport([a, b], "all", Infinity).data).toHaveLength(2);
  expect(makeReport([a, b], reportScope(a), Infinity).data).toHaveLength(1);
});
it("報告與分析佇列共用全部範圍，排除無關與未結束棋局並取最新 N 盤", () => {
  const a = sample(1).game,
    b = sample(2).game,
    c = sample(3).game,
    d = sample(4).game;
  b.source = "lichess";
  b.time_control = "180";
  c.result = "*";
  d.white_username = "Other";
  expect(selectReportGames([a, b, c, d]).map((g) => g.id)).toEqual([2, 1]);
  expect(selectReportGames([a, b], "all", 1).map((g) => g.id)).toEqual([2]);
  expect(
    selectReportGames([a, b], JSON.stringify(["chesscom", "600"])).map(
      (g) => g.id,
    ),
  ).toEqual([1]);
});
