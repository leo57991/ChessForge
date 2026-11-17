import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { it, expect } from "vitest";
import { badgePosition, moveIcons, ReviewCoach } from "./ReviewCoach";
import { Chess } from "chess.js";
it("positions verdicts on the destination for either board orientation", () => {
  expect(badgePosition("e2e4", "white")).toEqual({ left: "58%", top: "50%" });
  expect(badgePosition("e2e4", "black")).toEqual({
    left: "45.5%",
    top: "37.5%",
  });
  expect(Object.keys(moveIcons)).toHaveLength(6);
});
it("defaults to one move verdict and explicit explain/best controls", () => {
  const b = new Chess(),
    before = b.fen();
  b.move("e4");
  const score = { cp: 20, mate: null, white_wins: true, depth: 10 };
  const a = {
    move_id: 1,
    evaluation_before: score,
    evaluation_after: score,
    best_move_uci: "e2e4",
    best_move_san: "e4",
    score_loss: 0,
    win_chance_loss: 0,
    classification: "Best",
    explanation: "explanation text",
    recommendation: "recommended text",
    principal_variation: [],
    actual_variation: [],
    candidates: [],
  };
  const noop = () => {};
  const html = renderToStaticMarkup(
    React.createElement(ReviewCoach, {
      a,
      move: {
        id: 1,
        game_id: 1,
        ply: 1,
        san: "e4",
        uci: "e2e4",
        fen_before: before,
        fen_after: b.fen(),
        flags: {},
      },
      onBest: noop,
      onActual: noop,
      onRetry: noop,
      onNext: noop,
      hasNext: false,
      lineKind: "best",
      lineIndex: null,
      onStep: noop,
      onPlay: noop,
      onPause: noop,
      onReturn: noop,
      playing: false,
    }),
  );
  expect(html).toContain("Explain");
  expect(html).toContain("Best Move");
  expect(html).toContain("⭐");
  expect(html).not.toContain("explanation text");
  expect(html).not.toContain("recommended text");
  expect(html).not.toContain("逐步變化");
});
