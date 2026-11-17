import { Chess } from "chess.js";
import { Analysis, Detail, Game, Move, PV, Run, Score } from "./types";
type Saved = {
  details: Detail[];
  analyses: Record<number, Analysis[]>;
  next: number;
};
let state: Saved = { details: [], analyses: {}, next: 1 };
let database: IDBDatabase;
const ready =
  typeof indexedDB === "undefined"
    ? Promise.resolve()
    : new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("chessforge", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("state");
        req.onerror = () =>
          reject(new Error("無法開啟瀏覽器儲存空間，請確認未封鎖 IndexedDB。"));
        req.onsuccess = () => {
          database = req.result;
          const r = database
            .transaction("state")
            .objectStore("state")
            .get("data");
          r.onsuccess = () => {
            if (r.result) state = r.result;
            for (const d of state.details)
              for (const run of d.runs)
                if (["running", "queued"].includes(run.status)) {
                  run.status = "failed";
                  run.error = "頁面上次關閉時中斷，請重新分析。";
                }
            resolve();
          };
          r.onerror = () => reject(r.error);
        };
      });
function save() {
  return new Promise<void>((resolve, reject) => {
    const tx = database.transaction("state", "readwrite");
    tx.objectStore("state").put(state, "data");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error("儲存失敗，瀏覽器空間可能已滿。"));
  });
}
function forcedEnd(c: Chess) {
  if (
    c.isCheckmate() ||
    c.isStalemate() ||
    c.isInsufficientMaterial() ||
    Number(c.fen().split(" ")[4]) >= 150
  )
    return true;
  if (!c.isThreefoldRepetition()) return false;
  const fen = c.fen();
  const key = fen.split(" ").slice(0, 4).join(" ");
  const history = c.history({ verbose: true });
  const count =
    history.filter((m) => m.after.split(" ").slice(0, 4).join(" ") === key)
      .length +
    (history[0]?.before.split(" ").slice(0, 4).join(" ") === key ? 1 : 0);
  return (
    c.isCheckmate() ||
    c.isStalemate() ||
    c.isInsufficientMaterial() ||
    Number(fen.split(" ")[4]) >= 150 ||
    count >= 5
  );
}
export function parsePGN(
  text: string,
): {
  game: Omit<Game, "id">;
  moves: Omit<Move, "id" | "game_id">[];
  initial_fen: string;
  identity: string;
}[] {
  const parts = text
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\n\s*\n(?=\[)/)
    .reduce<string[]>((all, part) => {
      if (part.trim().startsWith("[")) all.push(part);
      else if (all.length) all[all.length - 1] += "\n\n" + part;
      else all.push(part);
      return all;
    }, []);
  return parts
    .filter((p) => p.trim())
    .map((p) => {
      const c = new Chess();
      c.loadPgn(p, { strict: false });
      const h = c.getHeaders();
      if (!["1-0", "0-1", "1/2-1/2"].includes(h.Result))
        throw new Error("只接受已結束且標記結果的 PGN。");
      if (h.Variant && !["Standard", "Chess"].includes(h.Variant))
        throw new Error("只支援標準西洋棋。");
      const hist = c.history({ verbose: true });
      const initial = hist[0]?.before || c.fen();
      const b = new Chess(initial);
      const moves = hist.map((m, i) => {
        if (forcedEnd(b)) throw new Error("棋局結束後仍有走法。");
        b.move(m.san);
        return {
          ply: i + 1,
          san: m.san,
          uci: m.from + m.to + (m.promotion || ""),
          fen_before: m.before,
          fen_after: m.after,
          flags: {
            capture: !!m.captured,
            check: m.san.includes("+") || m.san.includes("#"),
            promotion: !!m.promotion,
            castling: m.isKingsideCastle() || m.isQueensideCastle(),
            en_passant: m.isEnPassant(),
          },
        };
      });
      if (c.isCheckmate() && h.Result !== (c.turn() === "w" ? "0-1" : "1-0"))
        throw new Error("結果與將死局面不符。");
      if (
        (c.isStalemate() || c.isInsufficientMaterial()) &&
        h.Result !== "1/2-1/2"
      )
        throw new Error("結果與和棋局面不符。");
      const game = {
        white_username: h.White || "?",
        black_username: h.Black || "?",
        played_at: h.UTCDate || h.Date || "?",
        result: h.Result,
        time_control: h.TimeControl || "?",
        source: "pgn",
        pgn: p,
      };
      const identity = [
        initial,
        game.white_username.toLowerCase(),
        game.black_username.toLowerCase(),
        h.Date || "?",
        h.Round || "?",
        game.result,
        moves.map((m) => m.uci).join(" "),
      ].join("\n");
      return { game, moves, initial_fen: initial, identity };
    });
}
function identity(d: Detail) {
  const c = new Chess();
  c.loadPgn(d.game.pgn);
  const h = c.getHeaders();
  return [
    d.initial_fen,
    d.game.white_username.toLowerCase(),
    d.game.black_username.toLowerCase(),
    h.Date || "?",
    h.Round || "?",
    d.game.result,
    d.moves.map((m) => m.uci).join(" "),
  ].join("\n");
}
export class UCI {
  worker: Worker;
  pending: ((s: string) => void) | null = null;
  constructor(worker?: Worker) {
    this.worker =
      worker ??
      new Worker(
        import.meta.env.BASE_URL +
          "engine/stockfish-17.1-lite-single-03e3232.js",
      );
  }
  command(
    cmd: string,
    end: (s: string) => boolean,
    onLine?: (s: string) => void,
  ) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.worker.terminate();
        reject(new Error("Stockfish 超時，請重試。"));
      }, 45000);
      this.worker.onerror = () => {
        clearTimeout(timer);
        reject(new Error("引擎載入失敗，請檢查網路後重新分析。"));
      };
      this.worker.onmessage = (e) => {
        const line = String(e.data);
        onLine?.(line);
        if (end(line)) {
          clearTimeout(timer);
          resolve();
        }
      };
      this.worker.postMessage(cmd);
    });
  }
  async init() {
    await this.command("uci", (s) => s === "uciok");
    this.worker.postMessage("setoption name Hash value 32");
    await this.command("isready", (s) => s === "readyok");
  }
  async evaluate(
    board: Chess,
    initial: string,
    history: string[],
    depth: number,
    ms: number,
    multi: number,
  ) {
    if (forcedEnd(board)) {
      const mate = board.isCheckmate();
      return [
        {
          score: {
            cp: mate ? null : 0,
            mate: mate ? 0 : null,
            white_wins: mate && board.turn() === "b",
            depth: 0,
          },
          pv: [] as PV,
        },
      ];
    }
    this.worker.postMessage("setoption name MultiPV value " + multi);
    this.worker.postMessage(
      "position fen " +
        initial +
        (history.length ? " moves " + history.join(" ") : ""),
    );
    const lines = new Map<number, { score: Score; pv: PV }>();
    await this.command(
      `go depth ${depth} movetime ${ms}`,
      (s) => s.startsWith("bestmove"),
      (line) => {
        const m = line.match(/\bscore (cp|mate) (-?\d+)/),
          v = line.match(/\bpv (.+)/);
        if (!m || !v || /upperbound|lowerbound/.test(line)) return;
        const color = board.turn() === "w" ? 1 : -1,
          n = Number(m[2]) * color;
        const s: Score = {
          cp: m[1] === "cp" ? n : null,
          mate: m[1] === "mate" ? n : null,
          white_wins: n > 0,
          depth: Number(line.match(/\bdepth (\d+)/)?.[1] || 0),
        };
        const b = new Chess(board.fen());
        const pv: PV = [];
        try {
          for (const uci of v[1].trim().split(/\s+/)) {
            const mv = b.move({
              from: uci.slice(0, 2),
              to: uci.slice(2, 4),
              promotion: uci[4],
            });
            pv.push({ uci, san: mv.san });
          }
        } catch {
          return;
        }
        lines.set(Number(line.match(/\bmultipv (\d+)/)?.[1] || 1), {
          score: s,
          pv,
        });
      },
    );
    if (!lines.size) throw new Error("引擎沒有回傳合法變化，請重試。");
    return [...lines.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  }
  close() {
    this.worker.terminate();
  }
}
export function winChance(s: Score, white: boolean) {
  const p =
    s.mate !== null
      ? s.white_wins
        ? 1
        : 0
      : 1 / (1 + Math.exp(-Math.max(-10000, Math.min(10000, s.cp!)) / 250));
  return white ? p : 1 - p;
}
export function classify(b: Score, a: Score, white: boolean, same: boolean) {
  const loss = Math.max(0, 100 * (winChance(b, white) - winChance(a, white)));
  return {
    loss,
    label: same
      ? "Best"
      : loss < 1
        ? "Excellent"
        : loss < 3
          ? "Good"
          : loss < 8
            ? "Inaccuracy"
            : loss < 18
              ? "Mistake"
              : "Blunder",
    cp:
      b.cp !== null && a.cp !== null
        ? Math.max(0, (b.cp - a.cp) * (white ? 1 : -1))
        : null,
  };
}
let active = false;
async function analyze(d: Detail, r: Run) {
  let eng: UCI | undefined;
  try {
    eng = new UCI();
    await eng.init();
    if (r.status === "cancelled") return;
    r.status = "running";
    await save();
    const board = new Chess(d.initial_fen),
      history: string[] = [];
    for (const move of d.moves) {
      if (r.status === "cancelled") return;
      const before = await eng.evaluate(
          board,
          d.initial_fen,
          history,
          r.depth,
          r.limits.seconds_per_position * 1000,
          3,
        ),
        best = before[0].pv[0],
        white = board.turn() === "w";
      let recommendation =
        "引擎比較後建議 " +
        best.san +
        "。請播放變化觀察對方合理的應手；具體戰術原因需進一步檢查。";
      if (best.san.includes("x"))
        recommendation =
          "建議 " +
          best.san +
          "，此步直接吃子；是否保住物質收益，請查看後續變化。";
      board.move(move.san);
      history.push(move.uci);
      const after = await eng.evaluate(
          board,
          d.initial_fen,
          history,
          r.depth,
          r.limits.seconds_per_position * 1000,
          1,
        ),
        cl = classify(
          before[0].score,
          after[0].score,
          white,
          best.uci === move.uci,
        );
      let explanation = `走棋方的估計勝算損失 ${cl.loss.toFixed(1)} 個百分點。這是引擎評估的換算值，並非你的實際勝率。具體原因需進一步檢查。`;
      if (board.isStalemate() && winChance(before[0].score, white) > 0.8)
        explanation =
          "這一步讓對方沒有合法走法、卻沒有被將軍，形成逼和，原本的優勢變成和棋。";
      else if (after[0].pv.length) {
        const b = new Chess(board.fen());
        b.move(after[0].pv[0].san);
        if (b.isCheckmate())
          explanation =
            "漏看對方一步將死：對方可走 " +
            after[0].pv[0].san +
            "，你的王無法逃離將軍。";
      }
      if ((r.status as string) === "cancelled") return;
      state.analyses[r.id].push({
        move_id: move.id,
        evaluation_before: before[0].score,
        evaluation_after: after[0].score,
        best_move_uci: best.uci,
        best_move_san: best.san,
        score_loss: cl.cp,
        win_chance_loss: cl.loss,
        classification: cl.label,
        explanation,
        recommendation,
        principal_variation: before[0].pv,
        actual_variation: after[0].pv,
        candidates: before,
      });
      r.progress++;
      await save();
    }
    if ((r.status as string) !== "cancelled") r.status = "completed";
  } catch (e) {
    if (r.status !== "cancelled") {
      r.status = "failed";
      r.error = (e as Error).message;
    }
  } finally {
    eng?.close();
    active = false;
    await save();
  }
}
export async function browserAPI(path: string, body?: any): Promise<any> {
  await ready;
  if (path === "/health")
    return { engine_ready: typeof WebAssembly !== "undefined" };
  if (path === "/games")
    return state.details.map((d) => ({ ...d.game, run: d.runs[0] })).reverse();
  if (path === "/import") {
    if (body.pgn.length > 10_000_000) throw new Error("檔案超過 10 MB。");
    const parsed = parsePGN(body.pgn),
      ids = new Set(state.details.map(identity));
    let imported = 0,
      duplicates = 0;
    for (const p of parsed) {
      if (ids.has(p.identity)) {
        duplicates++;
        continue;
      }
      const id = state.next++;
      state.details.push({
        initial_fen: p.initial_fen,
        game: { ...p.game, source: body.source || "pgn", id },
        moves: p.moves.map((m) => ({ ...m, id: state.next++, game_id: id })),
        runs: [],
      });
      ids.add(p.identity);
      imported++;
    }
    await save();
    return { imported, duplicates };
  }
  if(path==='/sync') {
    const {fetchPublicPGN}=await import('./sync');
    const pgn=await fetchPublicPGN(body.source,body.username);
    return pgn.trim()?browserAPI('/import',{pgn,source:body.source}):{imported:0,duplicates:0};
  }
  if(path==='/review-data')return structuredClone(state.details.flatMap(d=>{
    const run=d.runs.find(r=>r.status==='completed');
    return run?[{game:d.game,moves:d.moves,run,analyses:state.analyses[run.id]||[]}]:[];
  }));
  const gm = path.match(/^\/games\/(\d+)(\/analyze)?$/);
  if (gm) {
    const d = state.details.find((d) => d.game.id === Number(gm[1]));
    if (!d) throw new Error("找不到棋局");
    if (!gm[2]) return structuredClone(d);
    if (!d.moves.length) throw new Error("零步和棋沒有需要分析的走法。");
    if (active) throw new Error("請先完成或取消目前的分析。");
    const r: Run = {
      id: state.next++,
      game_id: d.game.id,
      engine_version: "Stockfish 17.1 Lite · WASM",
      depth: body.mode === "deep" ? 18 : 12,
      multipv: 3,
      status: "queued",
      progress: 0,
      total: d.moves.length,
      limits: { seconds_per_position: body.mode === "deep" ? 1 : 0.15 },
    };
    d.runs.unshift(r);
    state.analyses[r.id] = [];
    active = true;
    await save();
    void analyze(d, r);
    return structuredClone(r);
  }
  const rm = path.match(/^\/runs\/(\d+)(\/cancel)?$/);
  if (rm) {
    const r = state.details
      .flatMap((d) => d.runs)
      .find((r) => r.id === Number(rm[1]));
    if (!r) throw new Error("找不到分析");
    if (rm[2]) {
      if (["running", "queued"].includes(r.status)) r.status = "cancelled";
      await save();
      return structuredClone(r);
    }
    return structuredClone({ run: r, analyses: state.analyses[r.id] || [] });
  }
  throw new Error("不支援的操作");
}
