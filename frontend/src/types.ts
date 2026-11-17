export type Score = {
  cp: number | null;
  mate: number | null;
  white_wins: boolean;
  depth: number;
};
export type PV = { uci: string; san: string }[];
export type Move = {
  id: number;
  game_id: number;
  ply: number;
  san: string;
  uci: string;
  fen_before: string;
  fen_after: string;
  flags: Record<string, boolean>;
};
export type Run = {
  id: number;
  game_id: number;
  engine_version: string;
  depth: number;
  multipv: number;
  status: string;
  progress: number;
  total: number;
  error?: string;
  limits: { seconds_per_position: number };
};
export type Game = {
  id: number;
  white_username: string;
  black_username: string;
  played_at: string;
  result: string;
  time_control: string;
  source: string;
  pgn: string;
  run?: Run;
};
export type Analysis = {
  move_id: number;
  evaluation_before: Score;
  evaluation_after: Score;
  best_move_uci: string;
  best_move_san: string;
  score_loss: number | null;
  win_chance_loss: number;
  classification: string;
  explanation: string;
  recommendation: string;
  principal_variation: PV;
  actual_variation: PV;
  candidates: { score: Score; pv: PV }[];
};
export type Detail = {
  initial_fen: string;
  game: Game;
  moves: Move[];
  runs: Run[];
};
export const labels: Record<string, string> = {
  Best: "最佳",
  Excellent: "優秀",
  Good: "良好",
  Inaccuracy: "不精確",
  Mistake: "錯誤",
  Blunder: "嚴重失誤",
};
export function scoreText(s?: Score) {
  return !s
    ? "—"
    : s.mate !== null
      ? `${s.white_wins ? "白" : "黑"}方將死 ${Math.abs(s.mate)}`
      : `${s.cp! >= 0 ? "+" : ""}${(s.cp! / 100).toFixed(2)}`;
}
export function pvPositions(fen: string, pv: PV, ChessClass: any) {
  const b = new ChessClass(fen);
  return [
    fen,
    ...pv.map((m) => {
      b.move({
        from: m.uci.slice(0, 2),
        to: m.uci.slice(2, 4),
        promotion: m.uci[4],
      });
      return b.fen();
    }),
  ] as string[];
}
