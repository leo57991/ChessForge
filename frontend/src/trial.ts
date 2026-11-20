import { Chess } from "chess.js";
import { PV, Score } from "./types";

export function playUci(board: Chess, uci: string) {
  return board.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4],
  });
}

export type TrialEvaluation = {
  before: { score: Score; pv: PV };
  after: { score: Score; pv: PV };
};
