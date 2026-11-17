import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Chess, Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import {
  Analysis,
  Detail,
  Game,
  Run,
  labels,
  scoreText,
  pvPositions,
} from "./types";
import { browserAPI } from "./offline";
import "./style.css";
import {ReviewHome} from "./ReviewHome";
const browserMode = import.meta.env.VITE_BROWSER_MODE === "true";
async function api(path: string, body?: unknown) {
  if (browserMode) return browserAPI(path, body);
  const r = await fetch("/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + (sessionStorage.getItem("token") || ""),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok)
    throw new Error(
      typeof d.detail === "string" ? d.detail : JSON.stringify(d.detail),
    );
  return d;
}
function App() {
  const [games, setGames] = useState<Game[]>([]),
    [detail, setDetail] = useState<Detail | null>(null),
    [ply, setPly] = useState(0),
    [run, setRun] = useState<Run | null>(null),
    [analyses, setAnalyses] = useState<Analysis[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [orientation, setOrientation] = useState<"white" | "black">("white"),
    [mode, setMode] = useState("quick"),
    [research, setResearch] = useState<string | null>(null),
    [pvIndex, setPvIndex] = useState<number | null>(null),
    [playing, setPlaying] = useState(false),
    [search, setSearch] = useState(""),
    [health, setHealth] = useState(false),
    [promotion, setPromotion] = useState<{ from: string; to: string } | null>(
      null,
    );
  const [pastedPGN, setPastedPGN] = useState("");
  const input = useRef<HTMLInputElement>(null),
    sequence = useRef(0);
  async function refresh() {
    const g = await api("/games");
    setGames(g);
    const h = await api("/health");
    setHealth(h.engine_ready);
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  async function select(id: number, position=0, selectedRun?:number) {
    const seq = ++sequence.current;
    setDetail(null);
    setRun(null);
    setAnalyses([]);
    setError("");
    const d = await api("/games/" + id);
    if (seq !== sequence.current) return;
    setDetail(d);
    setPly(position);
    setResearch(null);
    setPvIndex(null);
    setPlaying(false);
    setOrientation(
      ["hugemudraven", "oo09080983"].includes(
        d.game.black_username.toLowerCase(),
      )
        ? "black"
        : "white",
    );
    if (selectedRun || d.runs.length) await loadRun(selectedRun || d.runs[0].id, seq);
  }
  async function loadRun(id: number, seq = sequence.current) {
    const d = await api("/runs/" + id);
    if (seq !== sequence.current) return;
    setRun(d.run);
    setAnalyses(d.analyses);
  }
  useEffect(() => {
    if (!run || !["queued", "running"].includes(run.status)) return;
    const t = setInterval(
      () => loadRun(run.id).catch((e) => setError(e.message)),
      800,
    );
    return () => clearInterval(t);
  }, [run?.id, run?.status]);
  const move = detail?.moves[ply - 1],
    a = analyses.find((x) => x.move_id === move?.id);
  const original = detail
    ? ply === 0
      ? detail.initial_fen
      : detail.moves[ply - 1].fen_after
    : new Chess().fen();
  const pv =
    a && move ? pvPositions(move.fen_before, a.principal_variation, Chess) : [];
  const fen =
    research || (pvIndex !== null ? pv[pvIndex] : original) || original;
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(
      () =>
        setPvIndex((i) => {
          if (i === null || i >= pv.length - 1) {
            setPlaying(false);
            return i;
          }
          return i + 1;
        }),
      1000,
    );
    return () => clearInterval(t);
  }, [playing, pv.length]);
  function jump(n: number) {
    setPly(Math.max(0, Math.min(detail?.moves.length || 0, n)));
    setResearch(null);
    setPvIndex(null);
    setPlaying(false);
    setPromotion(null);
  }
  async function act(fn: () => Promise<void>) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(files: FileList | null) {
    if (!files) return;
    await act(async () => {
      let count = 0,
        dups = 0;
      for (const f of Array.from(files)) {
        const r = await api("/import", { pgn: await f.text() });
        count += r.imported;
        dups += r.duplicates;
      }
      await refresh();
      setNotice(`已匯入 ${count} 盤，略過 ${dups} 盤重複棋局。`);
    });
  }
  function drop(from: string, to: string, promote?: string) {
    try {
      const b = new Chess(fen);
      const piece = b.get(from as Square);
      if (!promote && piece?.type === "p" && ["1", "8"].includes(to[1])) {
        setPromotion({ from, to });
        return false;
      }
      b.move({ from, to, promotion: promote || "q" });
      setResearch(b.fen());
      setPvIndex(null);
      setPlaying(false);
      return true;
    } catch {
      return false;
    }
  }
  const top = analyses
    .filter((x) => {
      const m = detail?.moves.find((m) => m.id === x.move_id);
      const name =
        m?.fen_before.split(" ")[1] === "w"
          ? detail?.game.white_username
          : detail?.game.black_username;
      return ["hugemudraven", "oo09080983"].includes(name?.toLowerCase() || "");
    })
    .sort((a, b) => b.win_chance_loss - a.win_chance_loss);
  const arrows: [Square, Square, string][] = [];
  if (move && (!research || research === move.fen_before) && pvIndex === null) {
    arrows.push([
      move.uci.slice(0, 2) as Square,
      move.uci.slice(2, 4) as Square,
      "#e2a663",
    ]);
    if (a)
      arrows.push([
        a.best_move_uci.slice(0, 2) as Square,
        a.best_move_uci.slice(2, 4) as Square,
        "#51c5aa",
      ]);
  }
  return (
    <div className="app">
      <header>
        <a
          className="brand"
          href="#"
          onClick={() => {
            sequence.current++;
            setDetail(null);
            setRun(null);
            setAnalyses([]);
            refresh().catch((e) => setError(e.message));
          }}
        >
          <span className="logo">♞</span> ChessForge <small>看懂每一步</small>
        </a>
        <div className="engine">
          <i className={health ? "online" : ""} />
          {browserMode
            ? "瀏覽器本機引擎"
            : health
              ? "Stockfish 就緒"
              : "尚未設定引擎"}
        </div>
      </header>
      <main>
        <div className="intro">
          <div>
            <div className="eyebrow">YOUR PERSONAL CHESS WORKSHOP</div>
            <h1>
              {detail
                ? "每一步，都有值得發現的事。"
                : "從下過的棋，找到進步的方向。"}
            </h1>
            <p>真實引擎分析 · 繁體中文解說 · 完全免費</p>
          </div>
          <button
            onClick={() => {
              const token = prompt("輸入 Windows LAN 模式顯示的存取碼");
              if (token !== null) {
                sessionStorage.setItem("token", token);
                refresh().catch((e) => setError(e.message));
              }
            }}
            hidden={browserMode}
          >
            LAN 存取碼
          </button>
        </div>
        {error && (
          <div role="alert" className="alert">
            {error}
            <button onClick={() => setError("")}>關閉</button>
          </div>
        )}
        {notice && (
          <div role="status" className="notice">
            {notice}
          </div>
        )}
        <ReviewHome games={games} hidden={!!detail} api={api} refresh={refresh} open={(id,ply,runId)=>{void act(()=>select(id,ply,runId))}}/>
        {!detail ? (
          <>
            <section
              className="import"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                upload(e.dataTransfer.files);
              }}
            >
              <div className="upload-icon">♙</div>
              <h2>你的棋局，就是最好的教材</h2>
              <p>拖放 PGN 到這裡，或選擇單盤／多盤棋譜</p>
              <input
                aria-label="選擇 PGN"
                ref={input}
                type="file"
                accept=".pgn"
                multiple
                hidden
                onChange={(e) => upload(e.target.files)}
              />
              <button
                className="primary"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                {busy ? "處理中…" : "＋ 匯入 PGN"}
              </button>
              <p className="muted">
                只接受已結束對局。棋譜與分析留在你的裝置上。
              </p>
              <details className="paste-pgn">
                <summary>或直接貼上 PGN</summary>
                <textarea
                  aria-label="貼上 PGN"
                  value={pastedPGN}
                  onChange={(e) => setPastedPGN(e.target.value)}
                  placeholder="[Event …]"
                />
                <button
                  disabled={busy || !pastedPGN.trim()}
                  onClick={() =>
                    act(async () => {
                      const r = await api("/import", { pgn: pastedPGN });
                      await refresh();
                      setNotice(
                        `已匯入 ${r.imported} 盤，略過 ${r.duplicates} 盤重複棋局。`,
                      );
                      setPastedPGN("");
                    })
                  }
                >
                  匯入貼上的棋譜
                </button>
              </details>
            </section>
            <div className="section-title">
              <h2>
                最近對局 <span>{games.length}</span>
              </h2>
              <input
                aria-label="搜尋對手"
                placeholder="搜尋棋手…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="games">
              {games
                .filter((g) =>
                  (g.white_username + g.black_username)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                )
                .sort(
                  (a, b) =>
                    Number(isRapid(b.time_control)) -
                    Number(isRapid(a.time_control)) ||
                    b.played_at.localeCompare(a.played_at) || b.id - a.id,
                )
                .map((g) => (
                  <button
                    className="game"
                    key={g.id}
                    onClick={() => act(() => select(g.id))}
                  >
                    <div className="game-icon">♟</div>
                    <div>
                      <strong>
                        {g.white_username} <em>vs</em> {g.black_username}
                      </strong>
                      <small>
                        {g.played_at} ·{" "}
                        {isRapid(g.time_control) ? "中速棋 · " : ""}
                        {g.time_control} · {g.source}
                      </small>
                    </div>
                    <span className="result">{g.result}</span>
                    <span className="status">
                      {g.run ? statusName(g.run.status) : "尚未分析"}
                    </span>
                    <b>↗</b>
                  </button>
                ))}
              {games.length === 0 && (
                <p className="empty">
                  還沒有棋局。匯入你的第一份 PGN，開始復盤。
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="game-heading">
              <button
                onClick={() => {
                  sequence.current++;
                  setDetail(null);
                  setRun(null);
                  setAnalyses([]);
                  refresh().catch((e) => setError(e.message));
                }}
              >
                ← 棋局列表
              </button>
              <span>
                {detail.game.white_username} <em>vs</em>{" "}
                {detail.game.black_username}　{detail.game.result}
              </span>
              <div className="analysis-controls">
                <select
                  aria-label="分析深度"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="quick">快速 · 深度上限 12</option>
                  <option value="deep">深入 · 深度上限 18</option>
                </select>
                <button
                  className="primary"
                  disabled={
                    busy || ["queued", "running"].includes(run?.status || "")
                  }
                  onClick={() =>
                    act(async () => {
                      const r = await api(
                        "/games/" + detail.game.id + "/analyze",
                        { mode },
                      );
                      setRun(r);
                      setAnalyses([]);
                    })
                  }
                >
                  ✦ {run ? "重新分析" : "分析這盤棋"}
                </button>
              </div>
            </div>
            <div className="review">
              <section className="board-panel">
                <div className="player">
                  <span>
                    {orientation === "white"
                      ? detail.game.black_username
                      : detail.game.white_username}
                  </span>
                  <small>
                    {research
                      ? "自由研究"
                      : pvIndex !== null
                        ? "引擎最佳變化"
                        : "原始棋局"}
                  </small>
                </div>
                <div className="board">
                  <Chessboard
                    id="review"
                    position={fen}
                    boardOrientation={orientation}
                    customArrows={arrows}
                    onPieceDrop={(f, t) => drop(f, t)}
                    customDarkSquareStyle={{ backgroundColor: "#638379" }}
                    customLightSquareStyle={{ backgroundColor: "#e6eadb" }}
                    animationDuration={150}
                  />
                </div>
                <div className="player">
                  <span>
                    {orientation === "white"
                      ? detail.game.white_username
                      : detail.game.black_username}
                  </span>
                  <small>
                    {ply} / {detail.moves.length} 半步
                  </small>
                </div>
                <div className="navigation">
                  <button aria-label="回到開局" onClick={() => jump(0)}>
                    ⏮
                  </button>
                  <button aria-label="上一步" onClick={() => jump(ply - 1)}>
                    ◀
                  </button>
                  <button aria-label="下一步" onClick={() => jump(ply + 1)}>
                    ▶
                  </button>
                  <button
                    aria-label="跳到結束"
                    onClick={() => jump(detail.moves.length)}
                  >
                    ⏭
                  </button>
                  <button
                    onClick={() =>
                      setOrientation(
                        orientation === "white" ? "black" : "white",
                      )
                    }
                  >
                    翻轉棋盤
                  </button>
                </div>
                <p className="legend">
                  <span>橘色：實際走法</span>
                  <span>綠色：引擎建議（失誤前局面）</span>
                </p>
                {(research || pvIndex !== null) && (
                  <button
                    className="return"
                    onClick={() => {
                      setResearch(null);
                      setPvIndex(null);
                      setPlaying(false);
                    }}
                  >
                    ↩ 回到原始棋局
                  </button>
                )}
                {promotion && (
                  <div className="promotion">
                    選擇升變：
                    {["q", "r", "b", "n"].map((p, i) => (
                      <button
                        key={p}
                        onClick={() => {
                          drop(promotion.from, promotion.to, p);
                          setPromotion(null);
                        }}
                      >
                        {["后", "車", "象", "馬"][i]}
                      </button>
                    ))}
                  </div>
                )}
                <section className="chart card">
                  <div className="section-title">
                    <h3>局面評估</h3>
                    <small>白方視角 · ±10 兵截斷顯示</small>
                  </div>
                  <svg
                    viewBox="0 0 600 100"
                    role="img"
                    aria-label="逐步引擎評估圖"
                  >
                    <line x1="0" y1="50" x2="600" y2="50" stroke="#53635b" />
                    <polyline
                      fill="none"
                      stroke="#83d7b1"
                      strokeWidth="2"
                      points={analyses
                        .map((x) => {
                          const m = detail.moves.find(
                            (m) => m.id === x.move_id,
                          )!;
                          const cp =
                            x.evaluation_after.cp ??
                            (x.evaluation_after.white_wins ? 1000 : -1000);
                          return `${(m.ply / detail.moves.length) * 600},${50 - Math.max(-1000, Math.min(1000, cp)) / 22}`;
                        })
                        .join(" ")}
                    />
                    {analyses.map((x) => {
                      const m = detail.moves.find((m) => m.id === x.move_id)!;
                      return (
                        <circle
                          key={x.move_id}
                          cx={(m.ply / detail.moves.length) * 600}
                          cy={
                            50 -
                            Math.max(
                              -1000,
                              Math.min(
                                1000,
                                x.evaluation_after.cp ??
                                  (x.evaluation_after.white_wins
                                    ? 1000
                                    : -1000),
                              ),
                            ) /
                              22
                          }
                          r="4"
                          fill={
                            x.classification === "Blunder"
                              ? "#ee816d"
                              : "transparent"
                          }
                          onClick={() => jump(m.ply)}
                        >
                          <title>
                            {m.ply} 半步 {m.san}
                          </title>
                        </circle>
                      );
                    })}
                  </svg>
                </section>
              </section>
              <aside>
                <section className="card coach">
                  <div className="section-title">
                    <h2>✦ 復盤教練</h2>
                    <span className="muted">規則與引擎證據</span>
                  </div>
                  {run && (
                    <div className="progress">
                      <div>
                        <span>
                          {statusName(run.status)} · {run.progress}/{run.total}
                        </span>
                        {["running", "queued"].includes(run.status) && (
                          <button
                            onClick={() =>
                              act(async () => {
                                await api("/runs/" + run.id + "/cancel", {});
                                await loadRun(run.id);
                              })
                            }
                          >
                            取消
                          </button>
                        )}
                      </div>
                      <progress value={run.progress} max={run.total} />
                      {run.error && <p className="alert">{run.error}</p>}
                      <small>
                        {run.engine_version || "等待引擎"} · MultiPV 3 ·
                        每局面時間上限 {run.limits.seconds_per_position}s
                      </small>
                    </div>
                  )}
                  {a && move ? (
                    <>
                      <span className={"badge " + a.classification}>
                        {labels[a.classification]}
                      </span>
                      <div className="comparison">
                        <div>
                          <small>你的走法</small>
                          <strong>
                            {Math.ceil(move.ply / 2)}
                            {move.ply % 2 ? "." : "…"} {move.san}
                          </strong>
                        </div>
                        <span>→</span>
                        <div>
                          <small>引擎建議</small>
                          <strong className="mint">{a.best_move_san}</strong>
                        </div>
                      </div>
                      <div className="metrics">
                        <span>
                          白方評估{" "}
                          <b>
                            {scoreText(a.evaluation_before)} →{" "}
                            {scoreText(a.evaluation_after)}
                          </b>
                        </span>
                        <span>
                          走棋方損失{" "}
                          <b>
                            {a.score_loss === null
                              ? "涉及將死"
                              : `${(a.score_loss / 100).toFixed(2)} 兵`}
                          </b>
                        </span>
                        <span>
                          實際搜尋深度{" "}
                          <b>
                            {a.evaluation_before.depth} /{" "}
                            {a.evaluation_after.depth}
                          </b>
                        </span>
                      </div>
                      <h3>為什麼這一步需要留意？</h3>
                      <p>{a.explanation}</p>
                      <h3>為什麼推薦 {a.best_move_san}？</h3>
                      <p>{a.recommendation}</p>
                      <button
                        onClick={() => {
                          setResearch(move.fen_before);
                          setPvIndex(null);
                          setPlaying(false);
                        }}
                      >
                        ↶ 回到失誤前，重新想一想
                      </button>
                      <div className="pv">
                        <h3>
                          最佳變化 <small>雙方合理應手，不是保證走法</small>
                        </h3>
                        <div className="pv-moves">
                          {a.principal_variation.map((m, i) => (
                            <button
                              className={pvIndex === i + 1 ? "selected" : ""}
                              key={i}
                              onClick={() => {
                                setResearch(null);
                                setPvIndex(i + 1);
                                setPlaying(false);
                              }}
                            >
                              {m.san}
                            </button>
                          ))}
                        </div>
                        <button
                          className="primary"
                          onClick={() => {
                            setResearch(null);
                            setPvIndex(0);
                            setPlaying(true);
                          }}
                        >
                          ▶ 播放最佳變化
                        </button>
                        <button onClick={() => setPlaying(false)}>暫停</button>
                      </div>
                      <details>
                        <summary>比較前三個候選走法</summary>
                        {a.candidates.map((c, i) => (
                          <p key={i}>
                            {i + 1}. {c.pv.map((m) => m.san).join(" ")} ·{" "}
                            {scoreText(c.score)}
                          </p>
                        ))}
                      </details>
                    </>
                  ) : (
                    <div className="coach-empty">
                      <span>♘</span>
                      <h3>
                        {ply === 0 ? "從一個棋步開始" : "讓引擎幫你看清楚"}
                      </h3>
                      <p>
                        {run
                          ? "點選已完成分析的棋步，查看評估與建議。"
                          : "按下「分析這盤棋」，逐步找出關鍵轉折。"}
                      </p>
                    </div>
                  )}
                </section>
                <section className="card moves">
                  <div className="section-title">
                    <h3>完整棋譜</h3>
                    <small>點選走法即可跳轉</small>
                  </div>
                  <div className="move-list">
                    {detail.moves.map((m) => {
                      const x = analyses.find((a) => a.move_id === m.id);
                      return (
                        <button
                          key={m.id}
                          className={`${ply === m.ply ? "selected" : ""} ${x?.classification || ""}`}
                          onClick={() => jump(m.ply)}
                        >
                          <small>
                            {Math.ceil(m.ply / 2)}
                            {m.ply % 2 ? "." : "…"}
                          </small>{" "}
                          {m.san}
                          <span>
                            {x
                              ? (
                                  {
                                    Blunder: "??",
                                    Mistake: "?",
                                    Inaccuracy: "?!",
                                    Best: "★",
                                  } as Record<string, string>
                                )[x.classification] || ""
                              : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
                {analyses.length > 0 && (
                  <section className="card summary">
                    <h3>
                      你的關鍵轉折{" "}
                      {run?.status !== "completed" && "（分析尚未完成）"}
                    </h3>
                    <p>
                      重大失誤{" "}
                      {top.filter((x) => x.classification === "Blunder").length}{" "}
                      次 · 最大估計勝算損失{" "}
                      {(top[0]?.win_chance_loss || 0).toFixed(1)} 個百分點
                    </p>
                    {top
                      .filter((x) => x.win_chance_loss >= 3)
                      .slice(0, 3)
                      .map((x) => {
                        const m = detail.moves.find((m) => m.id === x.move_id)!;
                        return (
                          <button key={x.move_id} onClick={() => jump(m.ply)}>
                            {Math.ceil(m.ply / 2)}
                            {m.ply % 2 ? "." : "…"} {m.san} → {x.best_move_san}{" "}
                            · {labels[x.classification]}
                          </button>
                        );
                      })}
                    <p className="muted">
                      改善重點：先重看損失最大的棋步，播放最佳變化，再回到失誤前自行嘗試。
                    </p>
                  </section>
                )}
              </aside>
            </div>
          </>
        )}
        <footer>
          CHESSFORGE{" "}
          <span>
            獨立開源工具，與 Chess.com 無隸屬關係 · 只分析已結束棋局
          </span>
        </footer>
      </main>
    </div>
  );
}
function isRapid(tc: string) {
  const n = Number(tc.split("+")[0]);
  return n >= 600 && n < 3600;
}
function statusName(s: string) {
  return (
    (
      {
        queued: "等待分析",
        running: "分析中",
        completed: "分析完成",
        cancelled: "已取消",
        failed: "分析失敗",
      } as Record<string, string>
    )[s] || s
  );
}
createRoot(document.getElementById("root")!).render(<App />);
