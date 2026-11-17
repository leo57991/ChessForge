import { useEffect, useRef, useState } from "react";
import { Chess, Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { ReviewedGame, categories } from "./weaknesses";
import { PV, scoreText } from "./types";
import {
  Card,
  Envelope,
  TrainingState,
  buildCards,
  ensurePlan,
  reconcile,
  recordAttempt,
  localDay,
  memoryLabel,
  acceptable,
  describeMove,
  linePositions,
  openingGroups,
  progressRows,
  transferStats,
  validateTraining,
} from "./training";
import "./training.css";
import { openingGuide } from "./openings";
type Props = {
  data: ReviewedGame[];
  api: (path: string, body?: unknown) => Promise<any>;
  open: (id: number, ply: number, run: number) => void;
};
export function TrainingHub({ data, api, open }: Props) {
  const [saved, setSaved] = useState<Envelope | null>(null),
    [tab, setTab] = useState<"daily" | "opening" | "progress">("daily"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [queue, setQueue] = useState<string[]>([]),
    [index, setIndex] = useState(0),
    [source, setSource] = useState<"daily" | "opening">("daily"),
    [openingTitle, setOpeningTitle] = useState(""),
    [answer, setAnswer] = useState(""),
    [selected, setSelected] = useState<Square | null>(null),
    [promotion, setPromotion] = useState<{ from: string; to: string } | null>(
      null,
    ),
    [feedback, setFeedback] = useState<{
      correct: boolean;
      message: string;
      pv?: PV;
    } | null>(null),
    [assisted, setAssisted] = useState(false),
    [context, setContext] = useState<number | null>(null),
    [pvStep, setPVStep] = useState<number | null>(null),
    [note, setNote] = useState(""),
    [backup, setBackup] = useState(""),
    [restore, setRestore] = useState(""),
    [showBackup, setShowBackup] = useState(false);
  const lock = useRef(false),
    started = useRef(Date.now()),
    attemptId = useRef(""),
    hintRecorded = useRef(false),
    activeRef = useRef<string | null>(null);
  const cards = buildCards(data),
    byId = new Map(cards.map((c) => [c.id, c])),
    card = byId.get(queue[index]),
    day = localDay(Date.now()),
    state = saved?.state,
    plan = state?.plans[day];

  useEffect(() => {
    api("/training")
      .then(setSaved)
      .catch((e) => setError(e.message));
  }, []);
  async function commit(next: TrainingState) {
    if (!saved) throw new Error("訓練資料尚未載入");
    const result = await api("/training", {
      revision: saved.revision,
      state: next,
    });
    setSaved(result);
    return result.state as TrainingState;
  }
  async function action(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function reset() {
    setAnswer("");
    setSelected(null);
    setPromotion(null);
    setFeedback(null);
    setAssisted(false);
    setContext(null);
    setPVStep(null);
    setNote("");
    hintRecorded.current = false;
    started.current = Date.now();
    attemptId.current =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Date.now().toString(36) +
          "-" +
          Array.from(crypto.getRandomValues(new Uint32Array(4))).join("-");
  }
  async function startDaily() {
    await action(async () => {
      if (!state) return;
      const next = await commit(ensurePlan(state, cards, Date.now()));
      const p = next.plans[day];
      setSource("daily");
      setQueue(
        p.ids.filter(
          (id) =>
            !p.completed.includes(id) &&
            byId.has(id) &&
            !next.memories[id]?.suspended,
        ),
      );
      setIndex(0);
      reset();
    });
  }
  function startOpening(c: Card, name: string) {
    if (busy) return;
    setSource("opening");
    setOpeningTitle(name);
    setQueue([c.id]);
    setIndex(0);
    reset();
  }
  async function record(c: Card, correct: boolean, help: boolean, uci: string) {
    if (!state) throw new Error("進度尚未載入");
    if (hintRecorded.current) return;
    await commit(
      recordAttempt(state, c, {
        id: attemptId.current,
        at: Date.now(),
        correct,
        assisted: help,
        uci,
        elapsed: Math.max(0, Date.now() - started.current),
        source,
        note: "",
      }),
    );
    hintRecorded.current = true;
  }
  async function submit(text: string) {
    const c = card;
    if (!c || feedback) return;
    await action(async () => {
      const b = new Chess(c.fen);
      let m;
      try {
        m = b.move(text.trim());
      } catch {
        throw new Error("這個走法不合法，請重新選擇；尚未計入作答。");
      }
      const uci = m.from + m.to + (m.promotion || "");
      let correct = c.accepted.includes(uci),
        message = "",
        pv: PV | undefined;
      if (!correct) {
        const result = await api("/training/check", {
          game_id: c.gameId,
          ply: c.ply,
          uci,
        });
        correct = acceptable(result.before, result.after, c.color === "w");
        pv = result.pv;
        message = `重新搜尋：白方評估 ${scoreText(result.before)} → ${scoreText(result.after)}。`;
      }
      await record(c, correct, assisted, uci);
      setAnswer(m.san);
      setContext(null);
      setPVStep(null);
      setFeedback({
        correct,
        message:
          message +
          (correct
            ? "這步符合目前引擎的可接受範圍。"
            : "這步沒有通過目前引擎的比較。請看對方的應手，再理解建議走法。"),
        pv,
      });
    });
  }
  function trySquares(from: string, to: string) {
    if (!card || feedback || busy || context !== null) return false;
    const legal = new Chess(card.fen)
      .moves({ verbose: true })
      .filter((m) => m.from === from && m.to === to);
    if (!legal.length) {
      setSelected(null);
      return false;
    }
    if (legal.some((m) => m.promotion)) {
      setPromotion({ from, to });
      return false;
    }
    void submit(from + to);
    setSelected(null);
    return false;
  }
  async function hint(reveal: boolean) {
    if (!card || feedback) return;
    await action(async () => {
      await record(card, false, true, "");
      setAssisted(true);
      if (reveal)
        setFeedback({
          correct: false,
          message: "已查看答案；本題記為輔助學習，隔天再獨立回想。",
        });
    });
  }
  function next() {
    setIndex(index + 1);
    reset();
  }
  async function preference(c: Card, preferred: string) {
    await action(async () => {
      if (!state) return;
      const next = reconcile(state, cards, Date.now());
      next.memories[c.id].preferred = preferred;
      await commit(next);
    });
  }
  async function suspend(c: Card) {
    await action(async () => {
      if (!state) return;
      const next = reconcile(state, cards, Date.now());
      next.memories[c.id].suspended = !next.memories[c.id].suspended;
      await commit(next);
    });
  }
  const groups = openingGroups(data, cards),
    rows = progressRows(data),
    transfer = state
      ? transferStats(data, state)
      : { opportunities: 0, errors: 0 };
  const remembered = state
    ? cards.filter((c) => memoryLabel(state.memories[c.id]) === "延後回憶穩定")
        .length
    : 0;
  const due = state
    ? cards.filter(
        (c) =>
          !state.memories[c.id]?.suspended &&
          (state.memories[c.id]?.due || 0) <= Date.now(),
      ).length
    : 0;
  const preferred = card && state?.memories[card.id]?.preferred;
  const pv = card
    ? card.analysis.candidates.find((c) => c.pv[0]?.uci === preferred)?.pv ||
      card.analysis.principal_variation
    : [];
  const positions = card ? linePositions(card, pv) : [];
  const fen = card
    ? context !== null
      ? context < card.context.length
        ? card.context[context].fen_before
        : card.fen
      : pvStep !== null
        ? positions[Math.min(pvStep, positions.length - 1)]
        : card.fen
    : undefined;
  return (
    <section className="training-hub" aria-label="個人訓練中心">
      <div className="section-title">
        <div>
          <div className="eyebrow">LEARN FROM YOUR OWN GAMES</div>
          <h2>今天，把一個弱點練熟</h2>
        </div>
        <span className="training-status">{remembered} 個局面通過延後回憶</span>
      </div>
      <nav className="training-tabs" aria-label="訓練項目">
        {(
          [
            ["daily", "每日訓練"],
            ["opening", "我的開局"],
            ["progress", "成長紀錄"],
          ] as const
        ).map(([id, name]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {name}
          </button>
        ))}
        <button onClick={() => setShowBackup(!showBackup)}>備份與設定</button>
      </nav>
      {error && (
        <div role="alert" className="alert">
          {error}
          <button
            disabled={busy}
            onClick={() =>
              action(async () => {
                setSaved(await api("/training"));
                setQueue([]);
              })
            }
          >
            重新載入進度
          </button>
        </div>
      )}
      {!saved ? (
        <p>讀取訓練進度…</p>
      ) : (
        <>
          {showBackup && (
            <div className="training-settings">
              <label>
                每日題數上限
                <select
                  value={state!.settings.dailySize}
                  disabled={busy}
                  onChange={(e) =>
                    action(async () => {
                      await commit({
                        ...state!,
                        settings: {
                          ...state!.settings,
                          dailySize: Number(e.target.value),
                        },
                      });
                    })
                  }
                >
                  {[5, 10, 15].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                每日新題上限
                <select
                  value={state!.settings.newLimit}
                  disabled={busy}
                  onChange={(e) =>
                    action(async () => {
                      await commit({
                        ...state!,
                        settings: {
                          ...state!.settings,
                          newLimit: Number(e.target.value),
                        },
                      });
                    })
                  }
                >
                  {[1, 2, 3, 5, 10].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <small>
                設定於下一份每日清單生效。到期題優先；同一盤最多兩題。
              </small>
              <button
                onClick={() => {
                  const text = JSON.stringify(
                    {
                      format: "chessforge-training",
                      exported_at: new Date().toISOString(),
                      state,
                    },
                    null,
                    2,
                  );
                  setBackup(text);
                  const url = URL.createObjectURL(
                    new Blob([text], { type: "application/json" }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "chessforge-training-" + day + ".json";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                下載訓練備份
              </button>
              {backup && (
                <textarea aria-label="匯出的訓練備份" readOnly value={backup} />
              )}
              <details>
                <summary>從備份還原（覆蓋目前訓練進度，不影響棋局）</summary>
                <p>
                  先在新裝置匯入／同步相同棋局並完成分析，再還原。建議先下載目前備份。
                </p>
                <textarea
                  aria-label="貼上訓練備份"
                  placeholder="貼上備份 JSON"
                  value={restore}
                  onChange={(e) => setRestore(e.target.value)}
                />
                <button
                  disabled={busy || !restore}
                  onClick={() =>
                    action(async () => {
                      const parsed = JSON.parse(restore);
                      if (parsed.format !== "chessforge-training")
                        throw new Error("不是 ChessForge 訓練備份");
                      await commit(validateTraining(parsed.state));
                      setRestore("");
                      setQueue([]);
                    })
                  }
                >
                  驗證並還原進度
                </button>
              </details>
            </div>
          )}
          {card ? (
            <div className="training-session">
              <div className="training-board">
                <div className="section-title">
                  <strong>
                    {source === "daily" ? "每日訓練" : "開局練習"} · {index + 1}
                    /{queue.length}
                  </strong>
                  <button disabled={busy} onClick={() => setQueue([])}>
                    暫停，稍後繼續
                  </button>
                </div>
                <p>
                  {card.color === "w" ? "白" : "黑"}方走棋 · 第{" "}
                  {Math.ceil(card.ply / 2)} 回合
                  {context !== null
                    ? " · 回看實戰過程"
                    : pvStep !== null
                      ? " · 引擎變化"
                      : ""}
                </p>
                {source === "opening" && (
                  <p className="opening-practice-title">
                    {openingTitle}
                    <br />
                    <small>
                      這是原對局的開局分類；目前題目可能位於該開局形成之前。
                    </small>
                  </p>
                )}
                <Chessboard
                  id="training-board"
                  position={fen}
                  boardOrientation={card.color === "w" ? "white" : "black"}
                  arePiecesDraggable={!busy && !feedback && context === null}
                  onPieceDrop={(from, to) => trySquares(from, to)}
                  onSquareClick={(square) => {
                    if (busy || feedback || context !== null) return;
                    const piece = new Chess(card.fen).get(square);
                    if (
                      selected &&
                      new Chess(card.fen)
                        .moves({ verbose: true })
                        .some((m) => m.from === selected && m.to === square)
                    ) {
                      trySquares(selected, square);
                      return;
                    }
                    setSelected(piece?.color === card.color ? square : null);
                  }}
                  customSquareStyles={
                    selected
                      ? { [selected]: { background: "rgba(218,179,95,.6)" } }
                      : {}
                  }
                  customDarkSquareStyle={{ background: "#688079" }}
                  customLightSquareStyle={{ background: "#e7eadb" }}
                />
                {promotion && (
                  <div className="notice">
                    選擇升變棋子{" "}
                    {(["q", "r", "b", "n"] as const).map((p, i) => (
                      <button
                        key={p}
                        disabled={busy}
                        onClick={() => {
                          void submit(promotion.from + promotion.to + p);
                          setPromotion(null);
                        }}
                      >
                        {["后", "車", "象", "馬"][i]}
                      </button>
                    ))}
                  </div>
                )}
                <div className="training-controls">
                  <button
                    disabled={busy}
                    onClick={() => {
                      setContext(context === null ? 0 : null);
                      setPVStep(null);
                    }}
                  >
                    {context === null ? "回看如何走到這裡" : "回到待解局面"}
                  </button>
                  {context !== null && (
                    <>
                      <button
                        disabled={context === 0}
                        onClick={() => setContext(context - 1)}
                      >
                        上一手
                      </button>
                      <button
                        disabled={context >= card.context.length}
                        onClick={() => setContext(context + 1)}
                      >
                        下一手
                      </button>
                      <small>
                        {context}/{card.context.length} 半步
                      </small>
                    </>
                  )}
                </div>
              </div>
              <div className="training-coach">
                <h3>
                  {feedback ? "理解，再隔天回想" : "先想一想，你會怎麼走？"}
                </h3>
                <p>檢查將軍、吃子、對方威脅。可點起點再點終點，或拖曳棋子。</p>
                {!feedback ? (
                  <>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void submit(answer);
                      }}
                    >
                      <label>
                        你的走法（SAN 或 UCI）
                        <input
                          aria-label="訓練走法"
                          placeholder="例如 Nf3 或 g1f3"
                          value={answer}
                          disabled={busy}
                          onChange={(e) => setAnswer(e.target.value)}
                        />
                      </label>
                      <button className="primary" disabled={busy || !answer}>
                        {busy ? "引擎比較及儲存中…" : "確認走法"}
                      </button>
                    </form>
                    <div className="training-controls">
                      <button
                        disabled={busy || assisted}
                        onClick={() => hint(false)}
                      >
                        給我提示
                      </button>
                      <button disabled={busy} onClick={() => hint(true)}>
                        查看答案
                      </button>
                    </div>
                    {assisted && (
                      <p className="notice">
                        {categories[card.category].tip}{" "}
                        本題已記為輔助學習，不算獨立答對。
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div
                      className={`notice ${feedback.correct ? "correct" : ""}`}
                      role="status"
                    >
                      {feedback.message}
                      {assisted ? " 使用提示，不增加掌握度。" : ""}
                    </div>
                    <h3>建議：{card.analysis.best_move_san}</h3>
                    <p>{card.evidence}</p>
                    <p>
                      {describeMove(
                        card.fen,
                        preferred || card.analysis.best_move_uci,
                      )}
                    </p>
                    <p>
                      這個局面在已分析的對局出現 {card.frequency} 次。評估深度{" "}
                      {card.analysis.evaluation_before.depth}，可能隨搜尋改變。
                    </p>
                    <div className="training-controls">
                      <button
                        onClick={() => {
                          setContext(null);
                          setPVStep(Math.max(0, (pvStep ?? 0) - 1));
                        }}
                        disabled={pvStep === 0}
                      >
                        變化上一手
                      </button>
                      <button
                        onClick={() => {
                          setContext(null);
                          setPVStep(
                            Math.min(positions.length - 1, (pvStep ?? 0) + 1),
                          );
                        }}
                        disabled={pvStep === positions.length - 1}
                      >
                        變化下一手
                      </button>
                      <button onClick={() => setPVStep(null)}>回到題目</button>
                    </div>
                    <p className="pv-text">
                      {pv.map((m, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setContext(null);
                            setPVStep(i + 1);
                          }}
                        >
                          {m.san}
                        </button>
                      ))}
                    </p>
                    {feedback.pv?.length ? (
                      <p>
                        你走法後的引擎應手：
                        {feedback.pv.map((m) => m.san).join(" ")}
                      </p>
                    ) : null}
                    {card.accepted.length > 1 && (
                      <label>
                        偏好的已驗證走法
                        <select
                          disabled={busy}
                          value={preferred || card.analysis.best_move_uci}
                          onChange={(e) => preference(card, e.target.value)}
                        >
                          {card.accepted.map((u) => (
                            <option key={u} value={u}>
                              {
                                new Chess(card.fen).move({
                                  from: u.slice(0, 2),
                                  to: u.slice(2, 4),
                                  promotion: u[4],
                                }).san
                              }
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label>
                      記下一個下次落子前要檢查的重點
                      <textarea
                        aria-label="訓練心得"
                        maxLength={2000}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="例如：移動象之前，先看 e4 兵有沒有人保護。"
                      />
                    </label>
                    <button
                      disabled={busy || !note}
                      onClick={() =>
                        action(async () => {
                          await commit({
                            ...state!,
                            attempts: state!.attempts.map((a) =>
                              a.id === attemptId.current ? { ...a, note } : a,
                            ),
                          });
                          setNote("");
                        })
                      }
                    >
                      保存心得
                    </button>
                    <p>
                      下次複習：
                      {state!.memories[card.id]?.due
                        ? new Date(state!.memories[card.id].due).toLocaleString(
                            "zh-TW",
                          )
                        : "尚未排定"}{" "}
                      · {memoryLabel(state!.memories[card.id])}
                    </p>
                    <button className="primary" disabled={busy} onClick={next}>
                      {index + 1 < queue.length ? "下一個局面" : "完成這次練習"}
                    </button>{" "}
                    <button
                      disabled={busy}
                      onClick={() => open(card.gameId, card.ply, card.runId)}
                    >
                      查看完整復盤
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              {tab === "daily" && (
                <div className="daily-overview">
                  <div>
                    <h3>
                      {plan &&
                      plan.ids.length > 0 &&
                      plan.completed.length === plan.ids.length
                        ? "今天的練習已完成"
                        : "先複習到期局面，再練新弱點"}
                    </h3>
                    <p>
                      目前 {cards.length} 個可練局面 · {due}{" "}
                      個待練／到期。每日清單會優先安排值得重看的決策，今天答完不會不斷加題。
                    </p>
                    {plan && (
                      <p>
                        今天已完成 {plan.completed.length}/{plan.ids.length}{" "}
                        題。
                        {!plan.ids.length
                          ? "今天沒有到期題，可到「我的開局」自由練習。"
                          : ""}
                      </p>
                    )}
                    <button
                      className="primary"
                      disabled={busy || !cards.length}
                      onClick={startDaily}
                    >
                      {plan ? "繼續今日訓練" : "安排並開始今日訓練"}
                    </button>
                  </div>
                  <aside>
                    <strong>怎樣才算記住？</strong>
                    <p>
                      先不看答案走棋。無提示答對後延長複習間隔；錯答或提示隔天再來。至少跨七天、三次獨立回憶，才標示穩定。
                    </p>
                    <small>
                      提前或同日重練不增加掌握度。不使用虛構 Elo 或連勝壓力。
                    </small>
                  </aside>
                </div>
              )}
              {tab === "opening" && (
                <>
                  <p>
                    依前 8
                    回合中最後辨識到的標準局面命名，支援不同走法順序轉入同一局面。中文為常見體系名稱，英文保留具體變化；ECO
                    是開局分類編號，不是難度。只統計已完成分析的對局，白黑分開練。
                  </p>
                  <aside className="opening-guide">
                    <h3>怎麼開始學？</h3>
                    <ol>
                      <li>
                        先選出現最多的一個開局，讀懂中央計畫，不必一次背完所有變化。
                      </li>
                      <li>
                        依回合順序練下面的真實局面；先按「回看如何走到這裡」，再自己走下一步。
                      </li>
                      <li>
                        答題後播放最佳變化，寫下「對方威脅什麼、我該先做什麼」，隔天回每日訓練複習。
                      </li>
                    </ol>
                    <p>
                      開局名稱描述你下過的路徑，不代表推薦照抄整盤；下列計畫是一般學習指引，具體走法仍以棋盤與引擎比較為準。
                    </p>
                  </aside>
                  {!groups.length && (
                    <p>先分析一盤自己的對局，就能看到開局名稱與練習局面。</p>
                  )}
                  <div className="opening-groups">
                    {groups.map((g) => (
                      <details key={g.name}>
                        <summary>
                          <strong>{g.name}</strong>
                          <span>
                            {g.games} 盤 · {g.wins} 勝 {g.draws} 和{" "}
                            {g.games - g.wins - g.draws} 負 · {g.cards.length}{" "}
                            個局面
                          </span>
                        </summary>
                        <div className="opening-guide">
                          <h4>這個開局在學什麼？</h4>
                          <p>{openingGuide(g.opening.english).idea}</p>
                          <p>
                            <strong>
                              你執{g.color === "w" ? "白" : "黑"}的重點：
                            </strong>
                            {
                              openingGuide(g.opening.english)[
                                g.color === "w" ? "white" : "black"
                              ]
                            }
                          </p>
                          <p>
                            <strong>這次練習先檢查：</strong>
                            {openingGuide(g.opening.english).check}
                          </p>
                          {g.opening.eco && (
                            <>
                              <p>
                                辨識依據：實戰至第{" "}
                                {Math.ceil(g.opening.matchedPly / 2)}{" "}
                                回合的局面符合資料庫；其後走法不保證仍屬理論。
                              </p>
                              <p>
                                <strong>資料庫代表走法：</strong>
                                {g.opening.line}
                              </p>
                              <a
                                href="https://github.com/lichess-org/chess-openings"
                                target="_blank"
                                rel="noreferrer"
                              >
                                查看 Lichess 開局資料 ↗
                              </a>
                            </>
                          )}
                        </div>
                        {g.cards
                          .sort((a, b) => a.ply - b.ply)
                          .map((c) => (
                            <div className="opening-row" key={c.id}>
                              <div>
                                <strong>
                                  第 {Math.ceil(c.ply / 2)} 回合 · {c.frequency}{" "}
                                  次遭遇
                                </strong>
                                <small>
                                  {memoryLabel(state!.memories[c.id])} ·{" "}
                                  {state!.memories[c.id]?.due
                                    ? new Date(
                                        state!.memories[c.id].due,
                                      ).toLocaleDateString("zh-TW")
                                    : "新局面"}
                                </small>
                                <small>
                                  前序：
                                  {c.context.map((m) => m.san).join(" ") ||
                                    "起始局面"}
                                </small>
                              </div>
                              <button
                                disabled={
                                  busy || state!.memories[c.id]?.suspended
                                }
                                onClick={() => startOpening(c, g.name)}
                              >
                                練這個局面
                              </button>
                              <button
                                disabled={busy}
                                onClick={() => suspend(c)}
                              >
                                {state!.memories[c.id]?.suspended
                                  ? "恢復安排"
                                  : "暫停安排"}
                              </button>
                            </div>
                          ))}
                      </details>
                    ))}
                  </div>
                </>
              )}
              {tab === "progress" && (
                <>
                  <h3>練習記憶與實戰表現分開看</h3>
                  <div className="training-metrics">
                    {Object.entries(categories).map(([id, cat]) => {
                      const attempts = state!.attempts.filter(
                          (a) => a.category === id && a.eligible,
                        ),
                        correct = attempts.filter(
                          (a) => a.correct && !a.assisted,
                        );
                      return (
                        <div key={id}>
                          <strong>{cat.name}</strong>
                          <b>
                            {correct.length}/{attempts.length}
                          </b>
                          <small>排程作答中，無提示答對次數</small>
                        </div>
                      );
                    })}
                  </div>
                  <p>
                    訓練後的新對局，同局面再次出現 {transfer.opportunities}{" "}
                    次，其中 {transfer.errors} 次仍出現不精確以上的損失。
                    {transfer.opportunities < 10
                      ? "樣本不足，先累積新對局。"
                      : "這是觀察紀錄，不證明訓練的因果效果。"}
                    同一天對局因缺乏精確時間不列入。
                  </p>
                  <div className="table-scroll">
                    <table>
                      <caption>
                        相同平台與時間控制：每 100 個己方棋步的錯誤／嚴重失誤
                      </caption>
                      <thead>
                        <tr>
                          <th>對局群組</th>
                          <th>最近 10 盤內</th>
                          <th>先前 10 盤內</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.name}>
                            <td>{r.name}</td>
                            {[r.recent, r.previous].map((s, i) => (
                              <td key={i}>
                                {s.rate === null ? "—" : s.rate.toFixed(1)}
                                <small>
                                  {s.games} 盤 / {s.own} 步{" "}
                                  {s.games < 5 ? "· 樣本不足" : ""}
                                </small>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p>
                    引擎版本與分析深度可能影響分類；不同平台／時間控制不合併比較，不換算為真實勝率。
                  </p>
                  <h3>最近的學習紀錄</h3>
                  {state!.attempts
                    .slice(-12)
                    .reverse()
                    .map((a) => (
                      <div className="attempt-row" key={a.id}>
                        <span>
                          {new Date(a.at).toLocaleString("zh-TW")} ·{" "}
                          {categories[a.category].name}
                        </span>
                        <strong>
                          {a.assisted
                            ? "輔助學習"
                            : a.correct
                              ? "獨立答對"
                              : "需要重看"}
                          {!a.eligible ? "（額外練習）" : ""}
                        </strong>
                        {a.note && <p>{a.note}</p>}
                      </div>
                    ))}
                  {!state!.attempts.length && (
                    <p>完成第一次練習後，這裡會開始累積真實紀錄。</p>
                  )}
                </>
              )}
              {!cards.length && (
                <p className="empty">
                  先同步自己的對局，並使用下方「分析最近 5
                  盤」。分析完成後，這裡會從你的棋局產生課程。
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
