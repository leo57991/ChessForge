import { openingGuide } from "./openings";
import { makeReport } from "./report";
import { openingAt15, overviewAxes } from "./reportMetrics";
export function ReportOverview({
  report: r,
  open,
}: {
  report: ReturnType<typeof makeReport>;
  open: (id: number, ply: number, run: number) => void;
}) {
  const axes = overviewAxes(r),
    opening = openingAt15(r.data);
  const points = (radius: number, i: number) => [
    170 + Math.sin((i * 2 * Math.PI) / 5) * radius,
    160 - Math.cos((i * 2 * Math.PI) / 5) * radius,
  ];
  const available = axes.filter((a) => a.score !== null);
  return (
    <>
      <h2>你的棋力表現總覽</h2>
      <p>
        Hugemudraven ／ oo09080983 · 最近 {r.data.length}{" "}
        盤已分析對局。以下是樣本中的實戰比例，不是 Elo、同儕排名或 Aimchess
        分數。
      </p>
      <div className="report-overview">
        <svg
          viewBox="0 0 340 330"
          role="img"
          aria-label="五項實戰比例雷達圖，缺資料不繪點"
        >
          {[25, 50, 75, 100].map((n) => (
            <polygon
              key={n}
              points={axes.map((_, i) => points(n, i).join(",")).join(" ")}
              fill="none"
              stroke="#56716a"
            />
          ))}
          {axes.map((a, i) => {
            const [x, y] = points(135, i),
              [ex, ey] = points(100, i);
            return (
              <g key={a.id}>
                <line x1="170" y1="160" x2={ex} y2={ey} stroke="#56716a" />
                <text
                  x={x}
                  y={y}
                  textAnchor="middle"
                  fill="currentColor"
                  fontSize="12"
                >
                  {a.title}
                  <tspan x={x} dy="17">
                    {a.score === null ? "缺資料" : a.score + "%"}
                  </tspan>
                </text>
              </g>
            );
          })}
          {available.length === 5 && (
            <polygon
              points={axes
                .map((a, i) => points(a.score!, i).join(","))
                .join(" ")}
              fill="#b8d99c44"
              stroke="#b8d99c"
              strokeWidth="2"
            />
          )}
          {axes.map(
            (a, i) =>
              a.score !== null && (
                <circle
                  key={a.id}
                  cx={points(a.score, i)[0]}
                  cy={points(a.score, i)[1]}
                  r="5"
                  fill="#b8d99c"
                />
              ),
          )}
        </svg>
        <div>
          <h3>如何解讀這份報告</h3>
          {axes.map((a) => (
            <p key={a.id}>
              <strong>
                {a.title}：{a.score === null ? "尚無樣本" : a.score + "%"}
              </strong>
              <br />
              {a.d
                ? `${a.n}/${a.d} ${a.unit}`
                : "累積符合條件的局面後才顯示比例。"}
              <br />
              <small>{a.advice}</small>
            </p>
          ))}
          <p>
            時間管理：尚未解析可靠逐步時鐘，暫不評分。不同指標的分母不同，不能直接比較為同一種能力；缺資料時不連成完整多邊形。
          </p>
        </div>
      </div>
      <h2>開局：第 15 回合後，你站得好嗎？</h2>
      <p>
        取黑方第 15 手後（第 30
        半步），統一換成你的視角；正值表示你領先。提前結束的棋局不補值，將死另計、不混入平均兵值。柱長上限為正負
        5 兵，數字保留實值。
      </p>
      <div className="opening-bars">
        {opening.groups.map((g) => (
          <article key={g.label}>
            <h3>{g.label}</h3>
            <strong>
              {g.mean === null
                ? "—"
                : `${g.mean >= 0 ? "+" : ""}${g.mean.toFixed(2)} 兵`}
            </strong>
            <div className="signed-track">
              <i
                style={{
                  left:
                    g.mean !== null && g.mean < 0
                      ? `${50 - Math.min(50, Math.abs(g.mean) * 10)}%`
                      : "50%",
                  width: `${g.mean === null ? 0 : Math.min(50, Math.abs(g.mean) * 10)}%`,
                  background:
                    g.mean !== null && g.mean < 0 ? "#df8c77" : "#a8d7be",
                }}
              />
            </div>
            <p>
              {g.n} 盤到達此局面 · {g.mates} 盤涉及將死
            </p>
            <p>
              {g.mean === null
                ? "資料不足，暫不下結論。"
                : g.n < 5
                  ? "目前樣本少，先查看具體棋局。"
                  : g.mean < -0.5
                    ? "平均帶著劣勢進入中局，先比較最早失去優勢的走法。"
                    : g.mean > 0.5
                      ? "平均帶著優勢進入中局，接著檢查能否保持並兌現。"
                      : "平均接近均勢，優先檢查後續中局的重大失誤。"}
            </p>
          </article>
        ))}
      </div>
      <h3>你常下的開局：表現與下一步</h3>
      {opening.openings.length ? (
        opening.openings.map((o) => (
          <article className="opening-report-row" key={o.key}>
            <h3>
              執{o.color === "w" ? "白" : "黑"} · {o.name}
            </h3>
            <p>{o.english}</p>
            <p>{openingGuide(o.english).idea}</p>
            <p>
              {o.n} 盤 · {o.wins} 勝 {o.draws} 和 {o.n - o.wins - o.draws}{" "}
              負；第 15 回合平均{" "}
              {o.mean === null ? "無可平均數據" : o.mean.toFixed(2) + " 兵"}（
              {o.mates} 盤將死另計）。
            </p>
            <p>
              {o.n < 5
                ? "樣本不足 5 盤，先復盤一個實例，不判定這個開局適不適合你。"
                : o.mean !== null && o.mean > 0.5 && o.wins / o.n < 0.5
                  ? "開局有優勢但勝局未過半：值得優先學習這類局面的中局計畫。"
                  : o.mean !== null && o.mean < -0.5
                    ? "這個開局平均進入中局時落後：先回看發展與中央交換，找出最早的失誤。"
                    : "先重看代表局面，理解棋子部署，再到 Lichess 練習對應開局的戰術。"}
            </p>
            <button
              onClick={() => open(o.example.d.game.id, 30, o.example.d.run.id)}
            >
              查看第 15 回合局面 →
            </button>{" "}
            <a
              href="https://lichess.org/training/openings"
              target="_blank"
              rel="noreferrer"
            >
              去 Lichess 找這個開局的題目 ↗
            </a>
          </article>
        ))
      ) : (
        <p>尚無到達第 15 回合的完整分析。</p>
      )}
    </>
  );
}
