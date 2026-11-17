import { useState } from "react";
import { Analysis, Move, labels, scoreText } from "./types";
import { categorize } from "./weaknesses";
export const moveIcons: Record<string, string> = {
  Best: "⭐",
  Excellent: "👍",
  Good: "✅",
  Inaccuracy: "🤔",
  Mistake: "😕",
  Blunder: "❌",
};
export function badgePosition(uci: string, orientation: "white" | "black") {
  const file = uci.charCodeAt(2) - 97,
    rank = Number(uci[3]) - 1;
  return {
    left: `${(orientation === "white" ? file : 7 - file) * 12.5 + 8}%`,
    top: `${(orientation === "white" ? 7 - rank : rank) * 12.5}%`,
  };
}
type Props = {
  a: Analysis;
  move: Move;
  onBest: () => void;
  onActual: () => void;
  onRetry: () => void;
  onNext: () => void;
  hasNext: boolean;
  lineKind: "best" | "actual";
  lineIndex: number | null;
  onStep: (n: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onReturn: () => void;
  playing: boolean;
};
export function ReviewCoach({
  a,
  move,
  onBest,
  onActual,
  onRetry,
  onNext,
  hasNext,
  lineKind,
  lineIndex,
  onStep,
  onPlay,
  onPause,
  onReturn,
  playing,
}: Props) {
  const [explain, setExplain] = useState(false),
    [best, setBest] = useState(false);
  const proof = categorize(move, a),
    line = lineKind === "best" ? a.principal_variation : a.actual_variation;
  return (
    <>
      <div className={"move-verdict " + a.classification}>
        <span role="img" aria-label={labels[a.classification]}>
          {moveIcons[a.classification]}
        </span>
        <div>
          <strong>
            {Math.ceil(move.ply / 2)}
            {move.ply % 2 ? "." : "…"} {move.san}
          </strong>
          <p>{labels[a.classification]}</p>
        </div>
      </div>
      <p className="review-one-line">
        {["Best", "Excellent", "Good"].includes(a.classification)
          ? "這一步在目前引擎搜尋中表現良好。"
          : proof.verified
            ? proof.evidence
            : "這一步讓局面變差了；先看對方的應手，再比較更好的選擇。"}
      </p>
      <div className="coach-actions">
        <button aria-pressed={explain} onClick={() => setExplain(!explain)}>
          💬 Explain · 解釋
        </button>
        <button
          aria-pressed={best}
          onClick={() => {
            setBest(true);
            onBest();
          }}
        >
          ⭐ Best Move · 最佳走法
        </button>
      </div>
      {explain && (
        <div className="coach-explanation">
          <h3>這一步發生了什麼？</h3>
          <p>{proof.verified ? proof.evidence : a.explanation}</p>
          <p>
            白方評估 {scoreText(a.evaluation_before)} →{" "}
            {scoreText(a.evaluation_after)}；走棋方損失{" "}
            {a.score_loss === null
              ? "涉及將死，不能換算兵值"
              : `${(a.score_loss / 100).toFixed(2)} 兵`}
            。
          </p>
          <button
            disabled={!a.actual_variation.length}
            onClick={() => {
              setBest(false);
              onActual();
            }}
          >
            ▶ 看對方怎麼應對
          </button>
        </div>
      )}
      {best && (
        <div className="best-explanation">
          <h3>推薦 {a.best_move_san}</h3>
          <p>{a.recommendation}</p>
          <button
            onClick={() => {
              onBest();
              onPlay();
            }}
          >
            ▶ 播放最佳變化
          </button>
        </div>
      )}
      {lineIndex !== null && (
        <div className="compact-variation" aria-label="逐步變化">
          <strong>
            {lineKind === "best" ? "最佳走法路線" : "實際走法之後"} ·{" "}
            {lineIndex}/{line.length}
          </strong>
          <p>
            {lineIndex === 0 ? "起始局面" : line[lineIndex - 1]?.san}{" "}
            <small>引擎預測，並非保證應手</small>
          </p>
          <div>
            <button
              aria-label="變化上一手"
              disabled={lineIndex === 0}
              onClick={() => onStep(lineIndex - 1)}
            >
              ◀
            </button>
            <button
              aria-label="變化下一手"
              disabled={lineIndex >= line.length}
              onClick={() => onStep(lineIndex + 1)}
            >
              ▶
            </button>
            <button onClick={playing ? onPause : onPlay}>
              {playing ? "暫停" : "播放"}
            </button>
            <button onClick={onReturn}>回到實戰</button>
          </div>
        </div>
      )}
      <div className="coach-actions">
        <button
          onClick={() => {
            setBest(false);
            onRetry();
          }}
        >
          ↶ 回到這手前重想
        </button>
        <button className="primary" disabled={!hasNext} onClick={onNext}>
          下一個關鍵步 →
        </button>
      </div>
      <details className="engine-details">
        <summary>進階：引擎數值與完整路線</summary>
        <p>
          白方視角：{scoreText(a.evaluation_before)} →{" "}
          {scoreText(a.evaluation_after)} · 搜尋深度 {a.evaluation_before.depth}
          /{a.evaluation_after.depth}
        </p>
        <p>
          估計勝算損失 {a.win_chance_loss.toFixed(1)}{" "}
          個百分點，並非你的實際勝率。標籤是 ChessForge 自訂規則，與 Chess.com
          不同。
        </p>
        {a.candidates.map((c, i) => (
          <p key={i}>
            {i + 1}. {c.pv.map((m) => m.san).join(" ")} · {scoreText(c.score)}
          </p>
        ))}
      </details>
    </>
  );
}
