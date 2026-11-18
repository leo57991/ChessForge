import { lichessResources } from "./lichessResources";
import { extendedReportMarkdown } from "./reportMetrics";
import { ReportOverview } from "./ReportOverview";
import { Game } from "./types";
import { useState } from "react";
import { ReviewedGame } from "./weaknesses";
import { makeReport, reportGames, reportScope, reportMarkdown } from "./report";
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
  open,
  games,
  generate,
  busy,
  progress,
  stop,
}: Props) {
  const [scope, setScope] = useState(""),
    [limit, setLimit] = useState(40),
    [color, setColor] = useState<"all" | "w" | "b">("all");
  const valid = reportGames(data),
    scopes = [
      ...new Set([
        ...valid.map(reportScope),
        ...games
          .filter((g) =>
            [g.white_username, g.black_username].some((n) =>
              ["hugemudraven", "oo09080983"].includes(n.toLowerCase()),
            ),
          )
          .map((g) => JSON.stringify([g.source, g.time_control])),
      ]),
    ].sort(
      (a, b) =>
        valid.filter((d) => reportScope(d) === b).length -
        valid.filter((d) => reportScope(d) === a).length,
    ),
    selected = scopes.includes(scope) ? scope : scopes[0] || "",
    selectedIds = new Set(
      games
        .filter(
          (g) =>
            JSON.stringify([g.source, g.time_control]) === selected &&
            [g.white_username, g.black_username].some((n) =>
              ["hugemudraven", "oo09080983"].includes(n.toLowerCase()),
            ),
        )
        .sort((a, b) => b.played_at.localeCompare(a.played_at) || b.id - a.id)
        .slice(0, limit)
        .map((g) => g.id),
    ),
    r = makeReport(
      data.filter((d) => selectedIds.has(d.game.id)),
      selected,
      limit,
      color,
    );
  function download() {
    const url = URL.createObjectURL(
      new Blob([reportMarkdown(r) + extendedReportMarkdown(r)], {
        type: "text/markdown;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `ChessForge-report-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <details className="personal-report card" open>
      <summary>
        <strong>📊 我的個人分析報告</strong>
        <span> 從多盤對局找到下一個改善重點</span>
      </summary>
      <section aria-label="個人分析報告">
        <p>
          先看樣本，再看弱點。只使用已完成的真實分析；ChessForge
          負責報告與復盤，練習前往 Lichess。
        </p>
        <div className="report-filters">
          <label>
            對局群組
            <select
              aria-label="報告對局群組"
              value={selected}
              onChange={(e) => setScope(e.target.value)}
            >
              {!scopes.length && <option value="">尚無完整分析</option>}
              {scopes.map((s) => (
                <option key={s} value={s}>
                  {JSON.parse(s).join(" · ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            範圍
            <select
              aria-label="報告樣本數"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              {[20, 40, 100].map((n) => (
                <option key={n} value={n}>
                  最近 {n} 盤對局
                </option>
              ))}
            </select>
          </label>
          <label>
            執棋
            <select
              aria-label="報告執棋顏色"
              value={color}
              onChange={(e) => setColor(e.target.value as typeof color)}
            >
              <option value="all">白黑全部</option>
              <option value="w">執白</option>
              <option value="b">執黑</option>
            </select>
          </label>
          <button onClick={download} disabled={!r.data.length}>
            下載我的報告
          </button>
        </div>
        <button
          className="primary"
          disabled={busy || !selected}
          onClick={() => generate(selected, limit)}
        >
          ✦ 生成／更新這組 {limit} 盤報告
        </button>
        {progress && (
          <p role="status">
            {progress} <button onClick={stop}>停止分析</button>
          </p>
        )}
        <p>
          生成報告會分析此群組最新對局中尚未完成的棋局，重用已有結果。請保持頁面開啟；可停止後再次生成以繼續。
        </p>
        <p>
          <strong>
            {r.data.length} 盤 · {r.own} 個己方走法 · {r.wins} 勝 {r.draws} 和{" "}
            {r.data.length - r.wins - r.draws} 負
          </strong>
          <br />
          {r.data[r.data.length - 1]?.game.played_at || "—"} ～{" "}
          {r.data[0]?.game.played_at || "—"}
          。此範圍只代表已分析樣本，不代表所有匯入棋局。
        </p>
        {r.data.length < 10 && (
          <p className="notice">
            樣本不足 10 盤：按「生成／更新報告」累積資料，暫不判定固定強弱。
          </p>
        )}
        <ReportOverview report={r} open={open} />
        <div className="report-metrics">
          {r.metrics.map((m) => (
            <article key={m.id}>
              <h3>{m.label}</h3>
              <strong>{m.d ? `${m.n} / ${m.d}` : "—"}</strong>
              <p>{m.d ? m.unit : "目前沒有符合條件的樣本"}</p>
              <details>
                <summary>怎麼計算／怎麼改善</summary>
                <p>{m.definition}</p>
                <p>{m.advice}</p>
              </details>
            </article>
          ))}
          <article>
            <h3>時間管理</h3>
            <strong>尚未評分</strong>
            <p>報告尚未擷取並驗證逐步時鐘，不從勝負猜測你是否時間不足。</p>
          </article>
        </div>
        <h3>根據你的弱點，去 Lichess 哪裡練？</h3>
        {r.priorities.length ? (
          r.priorities.map((g) => (
            <p key={g.id}>
              <strong>{g.name}</strong> · {g.count} 個局面／{g.games} 盤：
              {g.tip}
              <br />
              <a
                href={lichessResources[g.id].url}
                target="_blank"
                rel="noreferrer"
              >
                前往 Lichess：{lichessResources[g.id].label} ↗
              </a>
              <br />
              <small>{lichessResources[g.id].how}</small>
            </p>
          ))
        ) : (
          <p>目前沒有足夠錯步證據可安排優先項目。</p>
        )}
        <p>
          建議先復盤下方實例，再選一個對應主題做 5–10
          題，最後回到自己的棋局檢查同類問題。連結不會傳送你的棋譜，也不會自動同步
          Lichess 練習成績。
        </p>
        <div className="report-links">
          {r.picks.map((p) => (
            <button
              key={p.move.id}
              onClick={() => open(p.game.id, p.move.ply, p.runId)}
            >
              {p.game.played_at} · {p.game.white_username} vs{" "}
              {p.game.black_username} · {Math.ceil(p.move.ply / 2)}
              {p.move.ply % 2 ? "." : "…"} {p.move.san} → 復盤
            </button>
          ))}
        </div>
        <h3>優勢與劣勢的實戰例子</h3>
        {r.outcomes.length ? (
          r.outcomes.map((x, i) => (
            <button
              key={i}
              onClick={() => open(x.d.game.id, x.ply, x.d.run.id)}
            >
              {x.kind} · {x.d.game.played_at} · 第 {Math.ceil(x.ply / 2)} 回合 ↗
            </button>
          ))
        ) : (
          <p>目前沒有符合門檻的例子。</p>
        )}
        <h3>常見開局與結果</h3>
        <div className="report-table">
          <table>
            <thead>
              <tr>
                <th>開局／執棋</th>
                <th>樣本與結果</th>
                <th>開局每步平均損失</th>
              </tr>
            </thead>
            <tbody>
              {r.openings.map((o) => (
                <tr key={o.color + o.name}>
                  <td>
                    <button onClick={() => open(o.gameId, o.ply, o.runId)}>
                      執{o.color} · {o.name}
                    </button>
                  </td>
                  <td>
                    {o.games} 盤 · {o.wins} 勝 {o.draws} 和{" "}
                    {o.games - o.wins - o.draws} 負
                  </td>
                  <td>
                    {o.own ? (o.loss / o.own).toFixed(1) : "—"} 個估計勝算百分點
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          開局損失只統計前 10
          回合的己方棋步；勝負也受後續中殘局影響，不能直接當成開局優劣。
        </p>
        <h3>同一群組，最近與之前的失誤率</h3>
        <p>
          每 100 個己方走法：最近 {r.recent.games} 盤{" "}
          <strong>{r.recent.rate?.toFixed(1) || "—"}</strong>；之前{" "}
          {r.previous.games} 盤{" "}
          <strong>{r.previous.rate?.toFixed(1) || "—"}</strong>。
          {r.recent.games < 10 || r.previous.games < 10
            ? "樣本不足，先不判定進步或退步。"
            : "這是描述性比較，不代表訓練的因果效果。"}
        </p>
        <details>
          <summary>報告方法與限制</summary>
          <p>
            不混合平台或時間控制；不與未知的同分段資料比較，不計算虛構綜合分數。不同分析深度仍可能影響結果，速覽報告應再用深入分析確認。
          </p>
          {r.engines.map((x) => (
            <p key={x}>{x}</p>
          ))}
        </details>
      </section>
    </details>
  );
}
