import { it, expect } from "vitest";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { Chess } from "chess.js";
import { UCI } from "./offline";
// Exercise the exact distributed WASM engine and frontend UCI parser over
// a Node stdio transport. Browser Worker loading is a separate UI check.
class EngineTransport {
  process = spawn(process.execPath, [
    resolve("node_modules/stockfish/src/stockfish-17.1-lite-single-03e3232.js"),
  ]);
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor() {
    createInterface({ input: this.process.stdout }).on("line", (line) =>
      this.onmessage?.({ data: line }),
    );
    this.process.on("error", (e) => this.onerror?.(e));
  }
  postMessage(message: string) {
    this.process.stdin.write(message + "\n");
  }
  terminate() {
    this.process.kill();
  }
}
it("real WASM engine returns legal MultiPV and terminal mate scores", async () => {
  const engine = new UCI(new EngineTransport() as unknown as Worker);
  try {
    await engine.init();
    const board = new Chess();
    const lines = await engine.evaluate(board, board.fen(), [], 12, 500, 3);
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(line.score.depth).toBeGreaterThan(0);
      expect(line.pv.length).toBeGreaterThan(0);
      const probe = new Chess();
      for (const move of line.pv) expect(probe.move(move.san)).toBeTruthy();
    }
    const initial = board.fen();
    board.move("f3");
    board.move("e5");
    board.move("g4");
    board.move("Qh4#");
    const end = await engine.evaluate(
      board,
      initial,
      ["f2f3", "e7e5", "g2g4", "d8h4"],
      12,
      500,
      3,
    );
    expect(end[0].score).toMatchObject({
      cp: null,
      mate: 0,
      white_wins: false,
    });
  } finally {
    engine.close();
  }
}, 45000);
