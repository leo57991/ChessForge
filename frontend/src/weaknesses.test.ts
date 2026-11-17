import {it,expect} from 'vitest';
import {Chess} from 'chess.js';
import {buildReview,categorize,choosePositions,phase,ReviewedGame} from './weaknesses';
import {Analysis,Move} from './types';
const score={cp:0,mate:null,white_wins:false,depth:12};
function fixture(fen:string,san:string,reply:string):{move:Move;analysis:Analysis}{
 const b=new Chess(fen),before=b.fen(),m=b.move(san);const after=b.fen();const r=reply?b.move(reply):null;
 return {move:{id:1,game_id:1,ply:1,san:m.san,uci:m.from+m.to+(m.promotion||''),fen_before:before,fen_after:after,flags:{}},analysis:{move_id:1,evaluation_before:score,evaluation_after:score,best_move_uci:'e2e4',best_move_san:'e4',score_loss:200,win_chance_loss:30,classification:'Blunder',explanation:'',recommendation:'',principal_variation:[],candidates:[],actual_variation:r?[{uci:r.from+r.to+(r.promotion||''),san:r.san}]:[]}};
}
it('categorizes proven mate and unprotected piece, without inferred tactics',()=>{
 const c=new Chess();c.move('f3');c.move('e5');const f=fixture(c.fen(),'g4','Qh4#');expect(categorize(f.move,f.analysis).category).toBe('mate');
 const hanging=fixture('4k3/8/8/r7/7Q/8/8/4K3 w - - 0 1','Qh5','Rxh5');expect(categorize(hanging.move,hanging.analysis)).toMatchObject({category:'undefended',verified:true});
 const ordinary=fixture(new Chess().fen(),'e4','e5');expect(categorize(ordinary.move,ordinary.analysis)).toMatchObject({category:'opening',verified:false});
});
it('filters opponents and incomplete runs and picks diverse positions',()=>{
 const f=fixture(new Chess().fen(),'e4','e5');
 const d={game:{id:1,white_username:'Hugemudraven',black_username:'Opponent',played_at:'2026.11.17'},run:{id:1,status:'completed'},moves:[f.move],analyses:[f.analysis]} as ReviewedGame;
 expect(buildReview([d]).positions).toHaveLength(1);
 expect(buildReview([{...d,game:{...d.game,white_username:'Opponent',black_username:'Hugemudraven'}}]).positions).toHaveLength(0);
 expect(buildReview([{...d,run:{...d.run,status:'running'}}]).positions).toHaveLength(0);
 const p=buildReview([d]).positions[0];expect(choosePositions([p,p,p,{...p,game:{...p.game,id:2}}])).toHaveLength(3);
});
it('uses endgame phase for low material, not an invented cause',()=>{
 const f=fixture('8/7k/8/8/8/8/P7/K7 w - - 0 1','a3','Kg6');expect(phase(f.move)).toBe('endgame');
});
