import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { Analysis, Move, Score } from "./types";
import { ReviewedGame } from "./weaknesses";
import {
  DAY,
  acceptable,
  buildCards,
  emptyTraining,
  ensurePlan,
  localDay,
  memoryLabel,
  reconcile,
  recordAttempt,
  validateTraining,
  openingGroups,
  progressRows,
  transferStats,
  Card,
} from "./training";
const score = (cp: number): Score => ({
  cp,
  mate: null,
  depth: 14,
  white_wins: cp > 0,
});
function game(id = 1, played_at = "2026.11.01"): ReviewedGame {
  const b = new Chess();
  const moves: Move[] = [];
  const analyses: Analysis[] = [];
  for (const san of ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6"]) {
    const before = b.fen(),
      m = b.move(san),
      ply = moves.length + 1;
    const probe = new Chess(before),
      best = probe.moves({ verbose: true })[0];
    moves.push({
      id: id * 100 + ply,
      game_id: id,
      ply,
      san,
      uci: m.from + m.to,
      fen_before: before,
      fen_after: b.fen(),
      flags: {},
    });
    analyses.push({
      move_id: id * 100 + ply,
      evaluation_before: score(30),
      evaluation_after: score(-170),
      best_move_uci: best.from + best.to,
      best_move_san: best.san,
      score_loss: 200,
      win_chance_loss: 20,
      classification: "Mistake",
      explanation: "unit fixture",
      recommendation: "unit fixture",
      principal_variation: [{ uci: best.from + best.to, san: best.san }],
      actual_variation: [],
      candidates: [],
    });
  }
  return {
    game: {
      id,
      white_username: "Hugemudraven",
      black_username: "Other",
      played_at,
      result: "0-1",
      time_control: "600",
      source: "chesscom",
      pgn: "",
    },
    moves,
    analyses,
    run: {
      id,
      game_id: id,
      status: "completed",
      depth: 14,
      multipv: 3,
      progress: 6,
      total: 6,
      engine_version: "test fixture",
      limits: { seconds_per_position: 1 },
    },
  };
}
const now = new Date(2026, 10, 17, 12).getTime();
function answer(
  s: ReturnType<typeof emptyTraining>,
  c: Card,
  at: number,
  id: string,
  correct = true,
  assisted = false,
) {
  return recordAttempt(s, c, {
    id,
    at,
    correct,
    assisted,
    uci: c.accepted[0],
    elapsed: 1000,
    source: "daily",
    note: "",
  });
}
describe("training is derived from completed personal evidence", () => {
  it("deduplicates positions, retains frequency, excludes opponent and incomplete games", () => {
    const d = game();
    const cards = buildCards([d, game(2)]);
    expect(cards).toHaveLength(3);
    expect(cards.every((c) => c.frequency === 2 && c.color === "w")).toBe(true);
    expect(
      buildCards([{ ...d, run: { ...d.run, status: "running" } }]),
    ).toHaveLength(0);
    expect(
      buildCards([{ ...d, game: { ...d.game, white_username: "someone" } }]),
    ).toHaveLength(0);
    expect(openingGroups([d], cards)[0]).toMatchObject({
      games: 1,
      wins: 0,
      draws: 0,
    });
  });
  it("handles black viewpoint, equal alternatives, mate distances and losing positions", () => {
    expect(acceptable(score(-100), score(-80), false)).toBe(true);
    expect(acceptable(score(-100), score(0), false)).toBe(false);
    const mate = (n: number, w = true) => ({
      cp: null,
      mate: n,
      depth: 12,
      white_wins: w,
    });
    expect(acceptable(mate(3), mate(4), true)).toBe(true);
    expect(acceptable(mate(3), score(900), true)).toBe(false);
    expect(acceptable(mate(-8, false), mate(-1, false), true)).toBe(false);
    expect(acceptable(mate(0), mate(0), true)).toBe(true);
  });
});
describe("daily scheduling and retention", () => {
  it("persists a stable daily list, limits new cards and per-game concentration", () => {
    const cards = buildCards([game()]);
    const s = ensurePlan(emptyTraining(), cards, now);
    expect(s.plans[localDay(now)].ids).toHaveLength(2);
    expect(ensurePlan(s, cards.slice(0, 1), now + 1000).plans).toEqual(s.plans);
    const done = answer(
      s,
      cards.find((c) => c.id === s.plans[localDay(now)].ids[0])!,
      now,
      "one",
    );
    expect(done.plans[localDay(now)].completed).toHaveLength(1);
  });
  it("does not promote same-day repetitions, early reviews, hints or duplicate submissions", () => {
    const c = buildCards([game()])[0];
    let s = answer(emptyTraining(), c, now, "a");
    expect(s.memories[c.id].interval).toBe(1);
    s = answer(s, c, now + 1000, "b");
    expect(s.attempts[1].eligible).toBe(false);
    expect(s.memories[c.id].successes).toHaveLength(1);
    expect(answer(s, c, now + 2000, "b")).toBe(s);
    s = answer(s, c, now + DAY, "c", true, true);
    expect(s.memories[c.id].successes).toHaveLength(0);
    expect(s.memories[c.id].lapses).toBe(1);
  });
  it("requires spaced independent success before stable recall", () => {
    const c = buildCards([game()])[0];
    let s = answer(emptyTraining(), c, now, "a");
    expect(memoryLabel(s.memories[c.id])).toBe("學習中");
    s = answer(s, c, now + DAY, "b");
    s = answer(s, c, now + 4 * DAY, "c");
    expect(memoryLabel(s.memories[c.id])).toBe("學習中");
    s = answer(s, c, now + 11 * DAY, "d");
    expect(memoryLabel(s.memories[c.id])).toBe("延後回憶穩定");
    expect(s.memories[c.id].due).toBe(now + 25 * DAY);
  });
  it("resets changed answers without erasing attempts and recalls regression from later games once", () => {
    const c = buildCards([game()])[0];
    let s = answer(emptyTraining(), c, now, "a");
    s = reconcile(s, [{ ...c, signature: "a2a3" }], now + 1000);
    expect(s.memories[c.id].last).toBe(0);
    expect(s.attempts).toHaveLength(1);
    s = answer(s, c, now + DAY, "b");
    const later = { ...c, latestErrorDate: "2026-11-20" };
    s = reconcile(s, [later], now + 2 * DAY);
    expect(s.memories[c.id].successes).toHaveLength(0);
    expect(s.memories[c.id].regressionDate).toBe("2026-11-20");
    const before = s.memories[c.id].due;
    expect(reconcile(s, [later], now + 3 * DAY).memories[c.id].due).toBe(
      before,
    );
  });
  it("keeps suspended and future cards out of plans", () => {
    const cards = buildCards([game()]);
    let s = reconcile(emptyTraining(), cards, now);
    for (const c of cards) s.memories[c.id].suspended = true;
    expect(ensurePlan(s, cards, now).plans[localDay(now)].ids).toEqual([]);
  });
});
describe("honest measurement and portable persistence", () => {
  it("separates time controls and only counts genuinely later games as transfer", () => {
    const d = game(),
      c = buildCards([d])[0],
      s = answer(emptyTraining(), c, now, "a");
    const later = game(2, "2026.11.18");
    const today = game(3, "2026.11.17");
    expect(transferStats([later, today], s)).toEqual({
      opportunities: 1,
      errors: 1,
    });
    expect(
      progressRows([
        d,
        { ...later, game: { ...later.game, time_control: "180" } },
      ]),
    ).toHaveLength(2);
  });
  it("round-trips actual progress and rejects corrupt backups", () => {
    const c = buildCards([game()])[0],
      s = answer(emptyTraining(), c, now, "a");
    expect(validateTraining(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(() => validateTraining({ ...s, version: 2 })).toThrow();
    expect(() =>
      validateTraining({ ...s, attempts: [s.attempts[0], s.attempts[0]] }),
    ).toThrow();
    const bad = structuredClone(s);
    bad.memories[c.id].due = NaN;
    expect(() => validateTraining(bad)).toThrow();
  });
});
