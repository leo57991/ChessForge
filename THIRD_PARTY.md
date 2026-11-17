# 第三方軟體與授權

- python-chess: GPL-3.0-or-later — https://github.com/niklasf/python-chess
- Stockfish native: GPL-3.0 — https://github.com/official-stockfish/Stockfish/tree/sf_19
- stockfish.js 17.1.0 (Stockfish Lite Single WASM): GPL-3.0 — https://github.com/nmrugg/stockfish.js/tree/v17.1.0
  npm source package: https://www.npmjs.com/package/stockfish/v/17.1.0
  Published worker and WASM are copied unchanged from that npm package; build instructions are in its repository. Full license is served at engine/COPYING.txt on Pages.
- React / react-chessboard: MIT. chess.js: BSD-2-Clause.
- FastAPI / SQLAlchemy: MIT. Vite / Vitest: MIT.

ChessForge source is distributed under GPL-3.0-or-later. Source for the exact deployed application is available in this GitHub repository. No proprietary Chess.com analysis is used.

## Opening names

Opening position names and ECO codes are derived from [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), CC0-1.0, retrieved 2026-11-17 (upstream revision observed: `3ba6b20d31b2e6125cb0e6a2e792f400717d9d39`). Files a.tsv–e.tsv contain 3,865 entries. The committed `frontend/src/openings-data.json` is generated with chess.js by `frontend/scripts/import-openings.mjs`. Runtime use is entirely offline. Common Traditional Chinese family names and beginner learning guidance are independently authored for ChessForge; untranslated variations retain the upstream English name. Names describe matched positions, not engine recommendations.
