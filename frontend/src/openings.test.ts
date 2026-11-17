import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { identifyOpening, openingGuide } from "./openings";
function moves(sans: string[], fen?: string) {
  const b = new Chess(fen);
  return sans.map((san, i) => {
    const fen_before = b.fen();
    b.move(san);
    return { ply: i + 1, fen_before, fen_after: b.fen() };
  });
}
describe("named opening recognition", () => {
  it("recognizes accepted queen gambit and specific Italian positions", () => {
    const q = identifyOpening(moves(["d4", "d5", "c4", "dxc4"]));
    expect(q.name).toBe("接受后翼棄兵");
    expect(q.eco).toMatch(/^D2/);
    expect(q.matchedPly).toBe(4);
    const italian = identifyOpening(
      moves(["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6"]),
    );
    expect(italian.english).toContain("Italian Game");
    expect(italian.name).toBe("義大利開局");
  });
  it("recognizes transpositions without depending on move counters", () => {
    const a = identifyOpening(moves(["d4", "Nf6", "c4", "e6", "Nc3", "Bb4"]));
    const b = identifyOpening(moves(["c4", "Nf6", "Nc3", "e6", "d4", "Bb4"]));
    expect(a.english).toContain("Nimzo-Indian");
    expect(b.english).toBe(a.english);
  });
  it("does not name arbitrary custom starts or empty histories", () => {
    expect(identifyOpening([]).eco).toBe("");
    const custom = identifyOpening(
      moves(
        ["Nf3"],
        "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1",
      ),
    );
    expect(custom.custom).toBe(true);
    expect(custom.eco).toBe("");
  });
  it("retains the last match and ignores positions after eight moves", () => {
    const base = moves(["e4", "e5", "Nf3", "Nc6", "Bc4"]);
    const q = moves(["d4", "d5", "c4", "dxc4"]);
    expect(identifyOpening([...base, { ...q[3], ply: 17 }]).english).toContain(
      "Italian Game",
    );
    expect(
      identifyOpening([
        ...base,
        {
          ply: 6,
          fen_before: base[4].fen_after,
          fen_after: "8/8/8/8/8/8/8/K6k w - - 0 1",
        },
      ]).matchedPly,
    ).toBe(5);
  });
  it("offers side-specific guidance and an honest untranslated fallback", () => {
    const guide = openingGuide("Queen's Gambit Accepted: Central Variation");
    expect(guide.zh).toBe("接受后翼棄兵");
    expect(guide.white).not.toBe(guide.black);
    expect(openingGuide("Unlisted family").zh).toBe("");
    expect(openingGuide("Unlisted family").idea).toContain("中央");
  });
});
