import { ReviewedGame } from "./weaknesses";
import { makeReport, playerColor, playerScore } from "./report";
import { lichessResources } from "./lichessResources";
import { identifyOpening } from "./openings";
export function openingAt15(data: ReviewedGame[]) {
  const rows = data.flatMap((d) => {
    const m = d.moves.find((m) => m.ply === 30),
      c = playerColor(d);
    const a = m && d.analyses.find((a) => a.move_id === m.id);
    return a && c
      ? [
          {
            d,
            ply: 30,
            color: c,
            cp:
              a.evaluation_after.mate === null
                ? playerScore(a.evaluation_after, c)
                : null,
            mate: a.evaluation_after.mate !== null,
            name: identifyOpening(d.moves).name,
            english: identifyOpening(d.moves).english,
          },
        ]
      : [];
  });
  const aggregate = (xs: typeof rows) => {
    const finite = xs.filter((x) => x.cp !== null);
    return {
      n: xs.length,
      mates: xs.length - finite.length,
      mean: finite.length
        ? finite.reduce((s, x) => s + x.cp!, 0) / finite.length / 100
        : null,
    };
  };
  return {
    rows,
    groups: [
      { label: "整體", ...aggregate(rows) },
      { label: "執白", ...aggregate(rows.filter((x) => x.color === "w")) },
      { label: "執黑", ...aggregate(rows.filter((x) => x.color === "b")) },
    ],
    openings: [...new Set(rows.map((x) => x.color + ":" + x.english))]
      .map((key) => {
        const xs = rows.filter((x) => x.color + ":" + x.english === key);
        return {
          key,
          name: xs[0].name,
          english: xs[0].english,
          color: xs[0].color,
          ...aggregate(xs),
          wins: xs.filter(
            (x) => x.d.game.result === (x.color === "w" ? "1-0" : "0-1"),
          ).length,
          draws: xs.filter((x) => x.d.game.result === "1/2-1/2").length,
          example: xs.reduce((a, b) =>
            (a.cp ?? Infinity) < (b.cp ?? Infinity) ? a : b,
          ),
        };
      })
      .sort((a, b) => b.n - a.n),
  };
}
export function overviewAxes(r: ReturnType<typeof makeReport>) {
  return r.metrics.map((m) => ({
    ...m,
    score: m.d
      ? Math.round(
          100 *
            (["opening", "mistakes", "endgame"].includes(m.id)
              ? 1 - m.n / m.d
              : m.n / m.d),
        )
      : null,
    title: (
      {
        opening: "開局保持",
        mistakes: "避免失誤",
        conversion: "優勢兌現",
        recovery: "劣勢挽救",
        endgame: "殘局穩定",
      } as Record<string, string>
    )[m.id],
  }));
}
export function extendedReportMarkdown(r: ReturnType<typeof makeReport>) {
  const o = openingAt15(r.data);
  return (
    "\n\n## 建議前往 Lichess\n\n" +
    r.priorities
      .map(
        (g) =>
          `- ${g.name}：[${lichessResources[g.id].label}](${lichessResources[g.id].url})。${lichessResources[g.id].how}`,
      )
      .join("\n") +
    "\n\n## 實戰比例總覽\n\n" +
    overviewAxes(r)
      .map(
        (a) =>
          `- ${a.title}：${a.score === null ? "缺資料" : a.score + "%"}（${a.n}/${a.d} ${a.unit}）。`,
      )
      .join("\n") +
    "\n\n這些比例的分母不同，不能視為同一能力量尺，也不是 Aimchess 分數。\n\n## 第 15 回合開局表現\n\n" +
    o.groups
      .map(
        (g) =>
          `- ${g.label}：${g.mean === null ? "缺資料" : g.mean.toFixed(2) + " 兵"}，${g.n} 盤，其中 ${g.mates} 盤將死不計入兵值平均。`,
      )
      .join("\n") +
    "\n\n" +
    o.openings
      .map(
        (g) =>
          `- 執${g.color === "w" ? "白" : "黑"} ${g.name}：${g.n} 盤，${g.wins} 勝 ${g.draws} 和；第 15 回合平均 ${g.mean === null ? "缺資料" : g.mean.toFixed(2) + " 兵"}。${g.n < 5 ? "樣本少，不判定固定強弱。" : ""}`,
      )
      .join("\n")
  );
}
