import { Chess } from "chess.js";
import { Analysis, Move, PV, Score } from "./types";
import { categories, categorize, Category, ReviewedGame } from "./weaknesses";

export const DAY = 86400000;
export type Card = {
  id: string;
  signature: string;
  fen: string;
  color: "w" | "b";
  gameId: number;
  runId: number;
  ply: number;
  category: Category;
  opening: string | null;
  frequency: number;
  latestErrorDate: string;
  loss: number;
  analysis: Analysis;
  context: Move[];
  accepted: string[];
  evidence: string;
};
export type Memory = {
  signature: string;
  due: number;
  interval: number;
  successes: number[];
  lapses: number;
  last: number;
  suspended: boolean;
  preferred?: string;
  regressionDate?: string;
};
export type Attempt = {
  id: string;
  cardId: string;
  signature: string;
  at: number;
  day: string;
  correct: boolean;
  assisted: boolean;
  eligible: boolean;
  uci: string;
  elapsed: number;
  category: Category;
  source: "daily" | "opening";
  note: string;
};
export type Plan = { ids: string[]; completed: string[]; created: number };
export type TrainingState = {
  version: 1;
  memories: Record<string, Memory>;
  attempts: Attempt[];
  plans: Record<string, Plan>;
  settings: { dailySize: number; newLimit: number };
};
export type Envelope = { revision: number; state: TrainingState };
export const emptyTraining = (): TrainingState => ({
  version: 1,
  memories: {},
  attempts: [],
  plans: {},
  settings: { dailySize: 5, newLimit: 3 },
});
export function localDay(now: number) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const positionKey = (fen: string) =>
  fen.split(" ").slice(0, 4).join(" ");
export function ownMove(d: ReviewedGame, m: Move) {
  return ["hugemudraven", "oo09080983"].includes(
    (m.fen_before.split(" ")[1] === "w"
      ? d.game.white_username
      : d.game.black_username
    ).toLowerCase(),
  );
}
export function acceptable(best: Score, other: Score, white: boolean) {
  if (best.mate !== null || other.mate !== null) {
    // Do not call every move in a lost position correct just because win chance is zero.
    if (
      best.mate === null ||
      other.mate === null ||
      best.white_wins !== other.white_wins
    )
      return false;
    const winning = best.white_wins === white;
    return winning
      ? Math.abs(other.mate) <= Math.abs(best.mate) + 2
      : Math.abs(other.mate) >= Math.abs(best.mate) - 1;
  }
  return (best.cp! - other.cp!) * (white ? 1 : -1) <= 30;
}
export function openingName(d: ReviewedGame, color: "w" | "b") {
  const start = new Chess().fen();
  if (d.moves[0]?.fen_before !== start)
    return `${color === "w" ? "白" : "黑"}方 · 自訂起始局面`;
  return (
    `${color === "w" ? "白" : "黑"}方 · ` +
    d.moves
      .slice(0, 4)
      .map((m, i) => (i % 2 === 0 ? `${Math.floor(i / 2) + 1}.` : "") + m.san)
      .join(" ")
  );
}
export function buildCards(data: ReviewedGame[]): Card[] {
  const map = new Map<string, Card>();
  for (const d of data) {
    if (d.run.status !== "completed") continue;
    const moves = [...d.moves].sort((a, b) => a.ply - b.ply);
    const analyses = new Map(d.analyses.map((a) => [a.move_id, a]));
    for (const m of moves) {
      const a = analyses.get(m.id);
      if (!a?.best_move_uci || !ownMove(d, m)) continue;
      const mistake = ["Inaccuracy", "Mistake", "Blunder"].includes(
        a.classification,
      );
      if (!mistake && m.ply > 16) continue;
      const board = new Chess(m.fen_before),
        color = board.turn();
      const legal = new Set(
        board
          .moves({ verbose: true })
          .map((x) => x.from + x.to + (x.promotion || "")),
      );
      if (!legal.has(a.best_move_uci)) continue;
      const accepted = [
        ...new Set([
          a.best_move_uci,
          ...a.candidates
            .filter(
              (c) =>
                c.pv[0] &&
                acceptable(a.evaluation_before, c.score, color === "w"),
            )
            .map((c) => c.pv[0].uci),
        ]),
      ]
        .filter((u) => legal.has(u))
        .sort();
      const id = positionKey(m.fen_before),
        signature = accepted.join(",");
      const old = map.get(id);
      const proof = categorize(m, a);
      const card: Card = {
        id,
        signature,
        fen: m.fen_before,
        color,
        gameId: d.game.id,
        runId: d.run.id,
        ply: m.ply,
        category: mistake ? proof.category : "opening",
        opening: m.ply <= 16 ? openingName(d, color) : null,
        frequency: (old?.frequency || 0) + 1,
        latestErrorDate: [
          old?.latestErrorDate || "",
          mistake ? d.game.played_at.replace(/\./g, "-") : "",
        ]
          .sort()
          .pop()!,
        loss: a.win_chance_loss,
        analysis: a,
        context: moves.slice(0, m.ply - 1),
        accepted,
        evidence: mistake
          ? proof.evidence
          : "這個開局局面來自你的實際對局；以引擎候選練習下一步。",
      };
      // Prefer better searched evidence; retain highest observed loss for prioritization.
      if (
        old &&
        old.analysis.evaluation_before.depth > a.evaluation_before.depth
      ) {
        old.frequency++;
        old.latestErrorDate = card.latestErrorDate;
        old.loss = Math.max(old.loss, card.loss);
      } else {
        card.loss = Math.max(old?.loss || 0, card.loss);
        map.set(id, card);
      }
    }
  }
  return [...map.values()].sort(
    (a, b) =>
      b.loss - a.loss || b.frequency - a.frequency || a.id.localeCompare(b.id),
  );
}
export function reconcile(
  s: TrainingState,
  cards: Card[],
  now: number,
): TrainingState {
  const next = structuredClone(s);
  for (const c of cards) {
    const m = next.memories[c.id];
    if (!m || m.signature !== c.signature)
      next.memories[c.id] = {
        signature: c.signature,
        due: now,
        interval: 0,
        successes: [],
        lapses: m?.lapses || 0,
        last: 0,
        suspended: m?.suspended || false,
      };
    const current = next.memories[c.id];
    if (
      current.last &&
      c.latestErrorDate > localDay(current.last) &&
      c.latestErrorDate > (current.regressionDate || "")
    ) {
      current.due = Math.min(current.due, now);
      current.successes = [];
      current.regressionDate = c.latestErrorDate;
    }
  }
  return next;
}
export function ensurePlan(
  s: TrainingState,
  cards: Card[],
  now: number,
): TrainingState {
  const next = reconcile(s, cards, now),
    day = localDay(now);
  if (next.plans[day]) return next;
  const counts = new Map<number, number>(),
    chosen: Card[] = [];
  let fresh = 0;
  const candidates = cards
    .filter(
      (c) => !next.memories[c.id].suspended && next.memories[c.id].due <= now,
    )
    .sort((a, b) => {
      const ma = next.memories[a.id],
        mb = next.memories[b.id];
      return (
        Number(!!mb.last) - Number(!!ma.last) ||
        (ma.last && mb.last ? ma.due - mb.due : 0) ||
        b.loss +
          Math.log2(b.frequency + 1) * 3 -
          (a.loss + Math.log2(a.frequency + 1) * 3)
      );
    });
  for (const c of candidates) {
    const m = next.memories[c.id];
    if (
      (counts.get(c.gameId) || 0) >= 2 ||
      (!m.last && fresh >= next.settings.newLimit)
    )
      continue;
    chosen.push(c);
    counts.set(c.gameId, (counts.get(c.gameId) || 0) + 1);
    if (!m.last) fresh++;
    if (chosen.length >= next.settings.dailySize) break;
  }
  next.plans[day] = {
    ids: chosen.map((c) => c.id),
    completed: [],
    created: now,
  };
  return next;
}
export function recordAttempt(
  s: TrainingState,
  c: Card,
  input: Omit<
    Attempt,
    "cardId" | "signature" | "category" | "day" | "eligible"
  >,
): TrainingState {
  if (s.attempts.some((a) => a.id === input.id)) return s;
  const next = reconcile(s, [c], input.at),
    m = next.memories[c.id],
    day = localDay(input.at);
  const eligible =
    input.at >= m.due &&
    !next.attempts.some(
      (a) => a.cardId === c.id && a.day === day && a.eligible,
    );
  const a: Attempt = {
    ...input,
    cardId: c.id,
    signature: c.signature,
    category: c.category,
    day,
    eligible,
  };
  next.attempts.push(a);
  if (eligible) {
    m.last = input.at;
    if (input.correct && !input.assisted) {
      m.successes.push(input.at);
      m.interval = [1, 3, 7, 14, 30, 60][Math.min(m.successes.length - 1, 5)];
    } else {
      m.successes = [];
      m.interval = 1;
      m.lapses++;
    }
    m.due = input.at + m.interval * DAY;
  }
  if (
    !eligible &&
    !input.correct &&
    !input.assisted &&
    !s.attempts.some(
      (a) => a.cardId === c.id && a.day === day && !a.correct && !a.assisted,
    )
  ) {
    m.successes = [];
    m.lapses++;
    m.due = Math.min(m.due, input.at + DAY);
  }
  if (
    input.source === "daily" &&
    next.plans[day]?.ids.includes(c.id) &&
    !next.plans[day].completed.includes(c.id)
  )
    next.plans[day].completed.push(c.id);
  return next;
}
export function memoryLabel(m?: Memory) {
  if (!m?.last) return "尚未練習";
  if (
    m.successes.length >= 3 &&
    m.successes[m.successes.length - 1] - m.successes[0] >= 7 * DAY
  )
    return "延後回憶穩定";
  return m.successes.length ? "學習中" : "需要重看";
}
export function describeMove(fen: string, uci: string) {
  const b = new Chess(fen),
    m = b.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    });
  const parts: string[] = [];
  if (b.isCheckmate()) parts.push("直接將死");
  else if (b.isCheck()) parts.push("將軍，要求對方立即應對");
  if (m.captured) parts.push("直接吃子，是否保住收益需看後續應手");
  if (m.isKingsideCastle() || m.isQueensideCastle())
    parts.push("王車易位，同時移動王與車");
  if (m.promotion) parts.push("兵升變");
  if (
    ["n", "b"].includes(m.piece) &&
    ((m.color === "w" && m.from[1] === "1") ||
      (m.color === "b" && m.from[1] === "8"))
  )
    parts.push("將輕子從底線發展出來");
  if (["d4", "e4", "d5", "e5"].includes(m.to)) parts.push("走到中心四格之一");
  return `${m.san}：${parts.length ? parts.join("；") : "這步的具體作用需結合對方應手判讀"}。以上是局面事實，不是充分的最佳性證明。`;
}
export function linePositions(c: Card, pv: PV) {
  const b = new Chess(c.fen);
  const result = [b.fen()];
  for (const m of pv) {
    try {
      b.move({
        from: m.uci.slice(0, 2),
        to: m.uci.slice(2, 4),
        promotion: m.uci[4],
      });
      result.push(b.fen());
    } catch {
      break;
    }
  }
  return result;
}
export function openingGroups(data: ReviewedGame[], cards: Card[]) {
  const groups = new Map<
    string,
    { name: string; games: number; wins: number; draws: number; cards: Card[] }
  >();
  for (const d of data) {
    if (d.run.status !== "completed" || !d.moves.length) continue;
    for (const color of ["w", "b"] as const) {
      const player =
        color === "w" ? d.game.white_username : d.game.black_username;
      if (!["hugemudraven", "oo09080983"].includes(player.toLowerCase()))
        continue;
      const name = openingName(d, color),
        g = groups.get(name) || {
          name,
          games: 0,
          wins: 0,
          draws: 0,
          cards: [],
        };
      g.games++;
      if (d.game.result === (color === "w" ? "1-0" : "0-1")) g.wins++;
      if (d.game.result === "1/2-1/2") g.draws++;
      groups.set(name, g);
    }
  }
  // A transposed card can occur in multiple groups; reconstruct membership from its source FEN.
  for (const d of data) {
    for (const m of d.moves.filter((m) => m.ply <= 16 && ownMove(d, m))) {
      const name = openingName(d, m.fen_before.split(" ")[1] as "w" | "b"),
        g = groups.get(name),
        c = cards.find((c) => c.id === positionKey(m.fen_before));
      if (g && c && !g.cards.some((x) => x.id === c.id)) g.cards.push(c);
    }
  }
  return [...groups.values()].sort(
    (a, b) => b.games - a.games || a.name.localeCompare(b.name),
  );
}
export function progressRows(data: ReviewedGame[]) {
  const buckets = new Map<
    string,
    { date: string; own: number; errors: number; loss: number }[]
  >();
  for (const d of data) {
    if (d.run.status !== "completed") continue;
    const key = d.game.source + " · " + d.game.time_control;
    const own = d.moves.filter((m) => ownMove(d, m)),
      ids = new Set(own.map((m) => m.id)),
      analyses = d.analyses.filter((a) => ids.has(a.move_id));
    if (!analyses.length) continue;
    const row = {
      date: d.game.played_at,
      own: analyses.length,
      errors: analyses.filter((a) =>
        ["Mistake", "Blunder"].includes(a.classification),
      ).length,
      loss: analyses.reduce((n, a) => n + a.win_chance_loss, 0),
    };
    buckets.set(key, [...(buckets.get(key) || []), row]);
  }
  return [...buckets].map(([name, rows]) => {
    rows.sort((a, b) => b.date.localeCompare(a.date));
    const summarize = (r: typeof rows) => {
      const own = r.reduce((n, x) => n + x.own, 0);
      return {
        games: r.length,
        own,
        rate: own ? (r.reduce((n, x) => n + x.errors, 0) / own) * 100 : null,
      };
    };
    return {
      name,
      recent: summarize(rows.slice(0, 10)),
      previous: summarize(rows.slice(10, 20)),
    };
  });
}
export function transferStats(data: ReviewedGame[], s: TrainingState) {
  let opportunities = 0,
    errors = 0;
  const cards = new Map<string, number>();
  for (const a of s.attempts)
    if (a.eligible)
      cards.set(a.cardId, Math.min(cards.get(a.cardId) || Infinity, a.at));
  for (const d of data) {
    if (d.run.status !== "completed") continue;
    const date = d.game.played_at.replace(/\./g, "-");
    const analyses = new Map(d.analyses.map((a) => [a.move_id, a]));
    for (const m of d.moves) {
      const first = cards.get(positionKey(m.fen_before));
      if (
        !first ||
        !ownMove(d, m) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        date <= localDay(first)
      )
        continue;
      const a = analyses.get(m.id);
      if (!a) continue;
      opportunities++;
      if (["Inaccuracy", "Mistake", "Blunder"].includes(a.classification))
        errors++;
    }
  }
  return { opportunities, errors };
}
export function validateTraining(value: unknown): TrainingState {
  const s = value as TrainingState;
  if (
    !s ||
    s.version !== 1 ||
    !s.memories ||
    Array.isArray(s.memories) ||
    !s.plans ||
    !Array.isArray(s.attempts) ||
    !s.settings ||
    ![5, 10, 15].includes(s.settings.dailySize) ||
    !Number.isInteger(s.settings.newLimit) ||
    s.settings.newLimit < 1 ||
    s.settings.newLimit > 10
  )
    throw new Error("不支援或損毀的訓練備份");
  const finite = (x: unknown) =>
    typeof x === "number" && Number.isFinite(x) && x >= 0;
  for (const [id, m] of Object.entries(s.memories)) {
    if (
      !m ||
      typeof m.signature !== "string" ||
      !finite(m.due) ||
      !finite(m.last) ||
      !finite(m.interval) ||
      !finite(m.lapses) ||
      typeof m.suspended !== "boolean" ||
      !Array.isArray(m.successes) ||
      !m.successes.every(finite) ||
      (m.preferred !== undefined && typeof m.preferred !== "string") ||
      (m.regressionDate !== undefined && typeof m.regressionDate !== "string")
    )
      throw new Error("排程資料不合法");
    new Chess(id + " 0 1");
  }
  const ids = new Set<string>();
  for (const a of s.attempts) {
    if (
      !a ||
      typeof a.id !== "string" ||
      ids.has(a.id) ||
      typeof a.cardId !== "string" ||
      typeof a.signature !== "string" ||
      !finite(a.at) ||
      !finite(a.elapsed) ||
      typeof a.correct !== "boolean" ||
      typeof a.assisted !== "boolean" ||
      typeof a.eligible !== "boolean" ||
      typeof a.uci !== "string" ||
      typeof a.note !== "string" ||
      !Object.prototype.hasOwnProperty.call(categories, a.category) ||
      !["daily", "opening"].includes(a.source) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(a.day)
    )
      throw new Error("作答紀錄不合法");
    ids.add(a.id);
  }
  for (const [day, p] of Object.entries(s.plans)) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      !p ||
      !finite(p.created) ||
      !Array.isArray(p.ids) ||
      !Array.isArray(p.completed) ||
      !p.ids.every((id) => typeof id === "string") ||
      !p.completed.every((id) => p.ids.includes(id))
    )
      throw new Error("每日清單不合法");
  }
  return structuredClone(s);
}
