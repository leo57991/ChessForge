import {it,expect} from 'vitest';
import {fetchPublicPGN} from './sync';
it('requests only official completed standard game archives in serial order',async()=>{
 const urls:string[]=[];let active=0;
 const fake=async(url:any)=>{expect(active).toBe(0);active++;urls.push(String(url));active--;return new Response(JSON.stringify(urls.length===1?{archives:['https://api.chess.com/pub/player/hugemudraven/games/2026/11']}:{games:[{rules:'chess',end_time:123,pgn:'DONE'},{rules:'chess',pgn:'LIVE'},{rules:'chess960',end_time:124,pgn:'VARIANT'}]}))};
 expect(await fetchPublicPGN('chesscom','Hugemudraven',fake as typeof fetch)).toBe('DONE');expect(urls).toHaveLength(2);
});
it('rejects noncanonical archive URLs and reports API failures',async()=>{
 await expect(fetchPublicPGN('chesscom','Hugemudraven',async()=>new Response('',{status:429}))).rejects.toThrow('429');
 await expect(fetchPublicPGN('chesscom','Hugemudraven',async()=>new Response(JSON.stringify({archives:['https://evil.example/2026/11']})))).rejects.toThrow('非預期');
});
it('explicitly excludes ongoing Lichess games',async()=>{
 let url='';await fetchPublicPGN('lichess','oo09080983',async(u)=>{url=String(u);return new Response('')});expect(url).toContain('ongoing=false&finished=true');
});
