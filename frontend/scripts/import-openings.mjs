// Rebuild from the CC0 TSV files in a local directory; no runtime network dependency.
// node scripts/import-openings.mjs /path/to/tsv-directory
import { readFileSync, writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';
const directory = process.argv[2];
if (!directory) throw new Error('Provide the directory containing a.tsv through e.tsv');
const rows = [];
for (const letter of 'abcde') {
  const lines = readFileSync(`${directory}/${letter}.tsv`, 'utf8').trim().split('\n');
  for (const line of lines.slice(1)) {
    const [eco, name, pgn] = line.replace(/\r$/, '').split('\t');
    const board = new Chess(); board.loadPgn(pgn);
    rows.push([board.fen().split(' ').slice(0, 4).join(' '), eco, name, pgn]);
  }
}
writeFileSync(new URL('../src/openings-data.json', import.meta.url), JSON.stringify(rows));
console.log(`Compiled ${rows.length} named opening positions`);
