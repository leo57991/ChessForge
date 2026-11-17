import {Chess} from 'chess.js';
import {Game,Move,Analysis,Run} from './types';
export type ReviewedGame={game:Game;moves:Move[];run:Run;analyses:Analysis[]};
export type Category='mate'|'undefended'|'stalemate'|'opening'|'middlegame'|'endgame';
export const categories:Record<Category,{name:string;tip:string}>={
 mate:{name:'漏看一步將死',tip:'先檢查對方下一步所有將軍，確認自己的王還有安全格。'},
 undefended:{name:'未保護棋子',tip:'落子前看一次：哪些棋子被攻擊？吃回去的棋子在哪裡？'},
 stalemate:{name:'優勢變逼和',tip:'大幅領先時，每一步都確認對方仍有合法走法。'},
 opening:{name:'開局決策',tip:'從自己的開局錯步比較實際與最佳走法；先看發展、中心與王的位置。'},
 middlegame:{name:'中局決策',tip:'先找雙方的將軍、吃子與威脅，再比較引擎的三個候選。'},
 endgame:{name:'殘局決策',tip:'重播錯步前的局面，觀察王、兵與剩餘棋子的活動空間。'}
};
export type Position={game:Game;runId:number;move:Move;analysis:Analysis;category:Category;evidence:string;verified:boolean};
export function phase(move:Move):Category{
 const pieces=new Chess(move.fen_before).board().flat().filter(p=>p&&p.type!=='p'&&p.type!=='k');
 if(pieces.length<=4||(!pieces.some(p=>p?.type==='q')&&pieces.length<=6))return 'endgame';
 return move.ply<=20?'opening':'middlegame';
}
export function categorize(move:Move,a:Analysis):{category:Category;evidence:string;verified:boolean}{
 const after=new Chess(move.fen_after),color=move.fen_before.split(' ')[1] as 'w'|'b';
 if(after.isStalemate()&&a.evaluation_before.cp!==null&&a.evaluation_before.cp*(color==='w'?1:-1)>300)
  return {category:'stalemate',evidence:'這一步後對方沒有合法走法、卻未被將軍，原本超過 3 兵的引擎優勢變成和棋。',verified:true};
 const reply=a.actual_variation?.[0];
 if(reply){
  try{
   const candidate=after.moves({verbose:true}).find(m=>m.from+m.to+(m.promotion||'')===reply.uci);
   if(candidate){
    const unprotected=!!candidate.captured&&candidate.captured!=='p'&&after.attackers(candidate.to,color).length===0;
    after.move(candidate.san);
    if(after.isCheckmate())return {category:'mate',evidence:`對方的引擎首選 ${reply.san} 是立即將死。`,verified:true};
    if(unprotected)return {category:'undefended',evidence:`對方可走 ${reply.san}，吃掉一枚沒有己方棋子直接保護的棋子。`,verified:true};
   }
  }catch{/* Imported engine lines can be incomplete; do not invent a theme. */}
 }
 const category=phase(move);
 return {category,evidence:`這是${categories[category].name}中的評估損失；階段分類不是戰術原因，具體原因需配合引擎變化檢查。`,verified:false};
}
export function buildReview(data:ReviewedGame[]){
 const positions:Position[]=[];let ownMoves=0;const analyzed=new Set<number>();
 for(const d of data){
  if(d.run.status!=='completed')continue;
  const byId=new Map(d.moves.map(m=>[m.id,m]));
  for(const a of d.analyses){
   const m=byId.get(a.move_id);if(!m)continue;
   const name=m.fen_before.split(' ')[1]==='w'?d.game.white_username:d.game.black_username;
   if(!['hugemudraven','oo09080983'].includes(name.toLowerCase()))continue;
   ownMoves++;analyzed.add(d.game.id);
   if(!['Inaccuracy','Mistake','Blunder'].includes(a.classification))continue;
   positions.push({game:d.game,runId:d.run.id,move:m,analysis:a,...categorize(m,a)});
  }
 }
 positions.sort((a,b)=>b.analysis.win_chance_loss-a.analysis.win_chance_loss||b.game.played_at.localeCompare(a.game.played_at));
 const groups=(Object.keys(categories) as Category[]).map(id=>{
  const list=positions.filter(p=>p.category===id);
  return {id,...categories[id],count:list.length,games:new Set(list.map(p=>p.game.id)).size,loss:list.reduce((n,p)=>n+p.analysis.win_chance_loss,0)};
 }).sort((a,b)=>b.loss-a.loss);
 return {positions,groups,ownMoves,analyzedGames:analyzed.size};
}
export function choosePositions(positions:Position[],limit=6){
 const perGame=new Map<number,number>();const chosen:Position[]=[];
 for(const p of positions){const n=perGame.get(p.game.id)||0;if(n>=2)continue;perGame.set(p.game.id,n+1);chosen.push(p);if(chosen.length>=limit)break}
 return chosen;
}
