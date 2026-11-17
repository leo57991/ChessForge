import {describe,it,expect} from 'vitest';
import {Chess} from 'chess.js';
import {pvPositions,scoreText} from './types';
import {classify,parsePGN} from './offline';
const score=(cp:number)=>({cp,mate:null,white_wins:cp>0,depth:18});
describe('review correctness',()=>{
 it('normalizes black loss',()=>{expect(classify(score(-200),score(200),false,false).cp).toBe(400);expect(classify(score(200),score(-200),true,false).cp).toBe(400)});
 it('does not subtract mate as centipawns',()=>expect(classify(score(100),{cp:null,mate:-1,white_wins:false,depth:18},true,false).cp).toBeNull());
 it('plays a legal PV and preserves original board',()=>{const start=new Chess().fen();const p=pvPositions(start,[{uci:'e2e4',san:'e4'},{uci:'e7e5',san:'e5'}],Chess);expect(p).toHaveLength(3);expect(p[0]).toBe(start);expect(new Chess(p[2]).turn()).toBe('w')});
 it('parses multiple finished games',()=>{expect(parsePGN('[Event "A"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1\n\n[Event "B"]\n[Result "1-0"]\n\n1. e4 e5 1-0')).toHaveLength(2)});
 it('rejects illegal moves and unfinished games',()=>{expect(()=>parsePGN('[Result "1-0"]\n\n1. e5 1-0')).toThrow();expect(()=>parsePGN('1. e4 *')).toThrow()});
 it('renders mate zero as mate',()=>expect(scoreText({cp:null,mate:0,white_wins:false,depth:0})).toBe('黑方將死 0'));
});

import {existsSync,readFileSync} from 'node:fs';
const data='../data/ChessCom_hugemudraven_202611-1.pgn';
it.skipIf(!existsSync(data))('parses all supplied 248 games (private local fixture)',()=>{
 expect(parsePGN(readFileSync(data,'utf8'))).toHaveLength(220);
 expect(parsePGN(readFileSync('../data/lichess_oo09080983_2026-11-16.pgn','utf8'))).toHaveLength(28);
},120000);
