import { Chess } from "chess.js";
import { moveIcons } from "./ReviewCoach";
import { playUci, TrialEvaluation } from "./trial";
import { labels, scoreText } from "./types";

function describe(fen: string, label: string, evaluation: TrialEvaluation) {
  const board = new Chess(fen);
  const reply = evaluation.after.pv[0];
  if (board.isCheckmate()) return "這一步將死對手。";
  if (board.isStalemate())
    return "對手沒有合法走法，國王也沒有被將軍，棋局形成逼和。";
  if (board.isInsufficientMaterial())
    return "這一步後雙方棋子不足以將死，局面成為和棋。";
  if (reply) {
    const move = playUci(board, reply.uci);
    if (board.isCheckmate())
      return `對手可以走 ${move.san}，一步將死你的國王。`;
  }
  const verdict = ["Best", "Excellent", "Good"].includes(label)
    ? "這一步保住了大部分的局面價值。"
    : "這一步後，對手的局面比你走最佳走法時更好。";
  return reply ? `${verdict}引擎預估對手接下來會走 ${reply.san}。` : verdict;
}

type Props = {
  san?: string;
  fen: string;
  label: string | null;
  evaluation?: TrialEvaluation;
  error?: string;
  hint: boolean;
  onHint: () => void;
  onRetry: () => void;
};

export function TrialCoach({
  san,
  fen,
  label,
  evaluation,
  error,
  hint,
  onHint,
  onRetry,
}: Props) {
  if (!san) return <p>在棋盤上試走一步，教練就會分析你的選擇。</p>;
  if (error)
    return (
      <div role="alert">
        <p>{error}</p>
        <button onClick={onRetry}>重試分析</button>
      </div>
    );
  if (!evaluation || !label) return <p role="status">正在分析 {san}…</p>;
  const best = evaluation.before.pv[0];
  return (
    <div aria-live="polite">
      <div className={"move-verdict " + label}>
        <span role="img" aria-label={labels[label]}>
          {moveIcons[label]}
        </span>
        <div>
          <strong>試走 {san}</strong>
          <p>{labels[label]}</p>
        </div>
      </div>
      <p className="review-one-line">{describe(fen, label, evaluation)}</p>
      {best && (
        <button aria-pressed={hint} onClick={onHint}>
          {hint ? "回到試走後" : `⭐ 最佳走法 · ${best.san}`}
        </button>
      )}
      <details className="engine-details">
        <summary>查看引擎評估</summary>
        <p>
          白方視角 {scoreText(evaluation.before.score)} →{" "}
          {scoreText(evaluation.after.score)}
        </p>
      </details>
    </div>
  );
}
