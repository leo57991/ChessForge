import { useState } from "react";
import { Game } from "./types";
import { ReviewedGame, buildReview } from "./weaknesses";
import { makeReport, reportScope, reportMarkdown } from "./report";
import { extendedReportMarkdown } from "./reportMetrics";
import { ReportOverview } from "./ReportOverview";
import { lichessResources } from "./lichessResources";
import { selectReportGames, scopeLabel } from "./reportSelection";
type Props = {
  data: ReviewedGame[];
  games: Game[];
  generate: (scope: string, limit: number) => void;
  busy: boolean;
  progress: string;
  stop: () => void;
  open: (id: number, ply: number, run: number) => void;
};
export function PersonalReport({
  data,
  games,
  generate,
  busy,
  progress,
  stop,
  open,
}: Props) {
  const [scope, setScope] = useState("all"),
    [limit, setLimit] = useState(0);
  const selected = selectReportGames(games, scope, limit || Infinity),
    ids = new Set(selected.map((g) => g.id));
  const r = makeReport(
    data.filter((d) => ids.has(d.game.id)),
    scope,
    Infinity,
  );
  const positions = buildReview(r.data).positions;
  const scopes = [
    ...new Set(
      selectReportGames(games).map((g) =>
        JSON.stringify([g.source, g.time_control]),
      ),
    ),
  ];
  function download() {
    const url = URL.createObjectURL(
      new Blob([reportMarkdown(r) + extendedReportMarkdown(r)], {
        type: "text/markdown;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "ChessForge-個人報告.md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section
      className="personal-report card simple-report"
      aria-label="個人分析報告"
    >
      <div className="report-lead">
        <div>
          <span className="eyebrow">我的復盤報告</span>
          <h2>
            {r.data.length
              ? "下一盤，先改善這些地方。"
              : "看懂你的問題，從這裡開始。"}
          </h2>
          <p>
            {r.data.length
              ? `已從 ${r.data.length} 盤棋整理出值得重看的時刻。`
              : "讓引擎看過你的棋局，再用白話告訴你該注意什麼。"}
          </p>
        </div>
        <button
          className="primary"
          disabled={busy || !selected.length}
          onClick={() => generate(scope, selected.length)}
        >
          {progress
            ? "正在整理報告…"
            : r.data.length
              ? "更新我的報告"
              : "產生我的報告"}
        </button>
      </div>
      <p className="muted">
        {scopeLabel(scope)}
        {limit ? ` · 最近 ${limit} 盤` : ""} · 已完成 {r.data.length}／
        {selected.length} 盤
        {!selected.length
          ? "，先更新棋局或匯入 PGN。"
          : "。已有分析會直接重用。"}
      </p>
      {progress && (
        <div className="notice" role="status">
          {progress}
          <p>請保持頁面開啟。你可以先看已完成的結果。</p>
          <button onClick={stop}>暫停，之後繼續</button>
        </div>
      )}
      <details className="quiet-details">
        <summary>調整範圍</summary>
        <div className="report-filters">
          <label>
            棋局
            <select
              aria-label="報告對局範圍"
              value={scope}
              disabled={busy}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="all">全部對局（預設）</option>
              {scopes.map((s) => (
                <option key={s} value={s}>
                  {scopeLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            數量
            <select
              aria-label="報告樣本數"
              value={limit}
              disabled={busy}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              <option value={0}>全部已匯入對局</option>
              {[20, 40, 100].map((n) => (
                <option key={n} value={n}>
                  最近 {n} 盤
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>
      {!!r.data.length && (
        <>
          <div className="insight-grid">
            {r.priorities.map((g, i) => {
              const p = positions.find((p) => p.category === g.id);
              return (
                <article className="insight-card" key={g.id}>
                  <span className="insight-number">重點 {i + 1}</span>
                  <h3>{g.name}</h3>
                  <p>
                    {
                      (
                        {
                          mate: "落子前，先確認對手下一手能不能將死你。",
                          undefended:
                            "檢查被攻擊的棋子，確認被吃後能否安全吃回。",
                          stalemate:
                            "領先時，留意對手是否還有合法走法，避免意外逼和。",
                          opening: "先發展棋子、照顧中心和國王，再急著進攻。",
                          middlegame:
                            "先看對手的將軍、吃子和威脅，再決定自己的計畫。",
                          endgame:
                            "棋子變少後，仔細檢查國王的位置與兵能否升變。",
                        } as Record<string, string>
                      )[g.id]
                    }
                  </p>
                  <small>在 {g.games} 盤棋中找到相關局面</small>
                  {p && (
                    <button
                      className="primary"
                      onClick={() => open(p.game.id, p.move.ply, p.runId)}
                    >
                      查看這一步 →
                    </button>
                  )}
                  <details>
                    <summary>去 Lichess 怎麼練？</summary>
                    <p>{lichessResources[g.id].how}</p>
                    <a
                      href={lichessResources[g.id].url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {lichessResources[g.id].label} ↗
                    </a>
                  </details>
                </article>
              );
            })}
          </div>
          {!r.priorities.length && (
            <p className="empty">
              目前的分析沒有找到達到門檻的問題局面。新增棋局後再更新報告。
            </p>
          )}
          {r.data.length < 10 && (
            <p className="muted">
              目前棋局還少，先看實例，不急著判定固定弱點。
            </p>
          )}
          <details className="report-deep">
            <summary>查看完整圖表與開局表現</summary>
            <ReportOverview report={r} open={open} />
            <h3>依對局類型查看</h3>
            <p>
              不同時制分開看；全部對局的總覽只描述這批棋局，不作混合時制的進退步判定。
            </p>
            {[...new Set(r.data.map(reportScope))].map((s) => {
              const part = makeReport(r.data, s, Infinity);
              return (
                <details key={s}>
                  <summary>
                    {scopeLabel(s)} · {part.data.length} 盤
                  </summary>
                  {part.metrics.map((m) => (
                    <p key={m.id}>
                      <strong>{m.label}：</strong>
                      {m.d ? `${m.n}／${m.d} ${m.unit}` : "尚無樣本"}
                      <br />
                      {m.definition}
                    </p>
                  ))}
                </details>
              );
            })}
          </details>
          <div className="report-footer">
            <button onClick={download}>下載報告</button>
            <details>
              <summary>資料與計算方式</summary>
              <p>
                只計自己的已結束且完整分析的對局。零步棋局不計入。不同深度可能影響結果；重要決策建議深入復盤。尚無可靠時間管理評分或同級排名。
              </p>
              {r.engines.map((x) => (
                <p key={x}>{x}</p>
              ))}
            </details>
          </div>
        </>
      )}
    </section>
  );
}
