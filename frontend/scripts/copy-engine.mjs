import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('public/engine',{recursive:true});
for(const ext of ['js','wasm'])await copyFile(`node_modules/stockfish/src/stockfish-17.1-lite-single-03e3232.${ext}`,`public/engine/stockfish-17.1-lite-single-03e3232.${ext}`);
await copyFile('node_modules/stockfish/Copying.txt','public/engine/COPYING.txt');
