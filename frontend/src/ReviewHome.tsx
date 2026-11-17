import {useEffect,useRef,useState} from 'react';
import {TrainingHub} from './TrainingHub';
import {Game,labels} from './types';
import {accounts,Platform} from './sync';
import {buildReview,choosePositions,Category,ReviewedGame} from './weaknesses';
type Props={games:Game[];hidden:boolean;api:(path:string,body?:unknown)=>Promise<any>;refresh:()=>Promise<void>;open:(id:number,ply:number,runId:number)=>void};
export function ReviewHome({games,hidden,api,refresh,open}:Props){
 const [data,setData]=useState<ReviewedGame[]>([]),[category,setCategory]=useState<Category|'all'>('all'),[error,setError]=useState(''),[message,setMessage]=useState(''),[syncing,setSyncing]=useState<Platform|null>(null),[auto,setAuto]=useState(()=>localStorage.getItem('autoSyncChesscom')!=='false'),[batch,setBatch]=useState('');
 const initialized=useRef(false),cancel=useRef(false),currentRun=useRef<number|null>(null),syncLock=useRef(false);
 const review=buildReview(data);const picks=choosePositions(review.positions.filter(p=>category==='all'||p.category===category));
 async function reloadReview(){setData(await api('/review-data'))}
 useEffect(()=>{reloadReview().catch(e=>setError(e.message))},[games]);
 async function sync(source:Platform){
  if(syncLock.current)return;syncLock.current=true;setSyncing(source);setError('');
  localStorage.setItem('syncAttempt:'+source,String(Date.now()));
  try{const r=await api('/sync',{source,username:accounts[source]});await refresh();setMessage(`${source==='chesscom'?'Chess.com':'Lichess'}：新增 ${r.imported} 盤，略過 ${r.duplicates} 盤重複對局。`);localStorage.setItem('lastSync:'+source,new Date().toLocaleString('zh-TW'))}
  catch(e){setError((e as Error).message)}finally{setSyncing(null);syncLock.current=false}
 }
 useEffect(()=>{
  if(initialized.current)return;initialized.current=true;
  if(auto&&Date.now()-Number(localStorage.getItem('syncAttempt:chesscom')||0)>30*60*1000)void sync('chesscom');
 },[]);
 async function batchAnalyze(){
  cancel.current=false;setError('');let done=0,failed=0;
  const completed=new Set(data.map(d=>d.game.id));
  const queue=games.filter(g=>!completed.has(g.id)&&[g.white_username,g.black_username].some(n=>['hugemudraven','oo09080983'].includes(n.toLowerCase()))).sort((a,b)=>{
   const rapid=(s:string)=>{const n=Number(s.split('+')[0]);return n>=600&&n<3600?1:0};
   return rapid(b.time_control)-rapid(a.time_control)||b.played_at.localeCompare(a.played_at)||b.id-a.id;
  }).slice(0,5);
  if(!queue.length){setMessage('目前對局已分析完成，請先同步或匯入更多棋局。');return}
  try{
   for(let i=0;i<queue.length&&!cancel.current;i++){
    const g=queue[i];setBatch(`準備第 ${i+1}/${queue.length} 盤…`);
    const detail=await api('/games/'+g.id);if(!detail.moves.length)continue;
    const r=await api('/games/'+g.id+'/analyze',{mode:'quick'});currentRun.current=r.id;
    while(true){
     if(cancel.current){await api('/runs/'+r.id+'/cancel',{});break}
     const status=await api('/runs/'+r.id);setBatch(`第 ${i+1}/${queue.length} 盤 · ${status.run.progress}/${status.run.total} 半步`);
     if(!['queued','running'].includes(status.run.status)){if(status.run.status==='completed')done++;else failed++;break}
     await new Promise(resolve=>setTimeout(resolve,800));
    }
    await reloadReview();
   }
   await refresh();setMessage(`已完成 ${done} 盤${failed?`，${failed} 盤分析未完成`:''}。${cancel.current?'已停止後續分析。':'已依你的錯步挑選復盤局面。'}`);
  }catch(e){setError((e as Error).message)}finally{setBatch('');currentRun.current=null}
 }
 async function stop(){cancel.current=true;if(currentRun.current)try{await api('/runs/'+currentRun.current+'/cancel',{})}catch(e){setError((e as Error).message)}}
 if(hidden)return batch?<div className="notice">弱點分析進行中：{batch} <button onClick={stop}>停止</button></div>:null;
 return <section className="weakness-home">
  <div className="sync-strip"><div><strong>連接你的公開對局</strong><small>Chess.com · {accounts.chesscom}　／　Lichess · {accounts.lichess}</small><label><input type="checkbox" checked={auto} onChange={e=>{setAuto(e.target.checked);localStorage.setItem('autoSyncChesscom',String(e.target.checked));if(e.target.checked)void sync('chesscom')}}/>開啟頁面時自動同步 Chess.com（最多每 30 分鐘一次）</label></div><div className="sync-actions"><button disabled={!!syncing} onClick={()=>sync('chesscom')}>{syncing==='chesscom'?'同步中…':'同步 Chess.com'}</button><button disabled={!!syncing} onClick={()=>sync('lichess')}>{syncing==='lichess'?'同步中…':'同步 Lichess'}</button></div></div>
  <p className="sync-note">最近 3 個有棋局的月份、最多 200 盤 Chess.com；Lichess 最近 100 盤。只下載已結束的標準棋局。{localStorage.getItem('lastSync:chesscom')&&` 上次成功同步：${localStorage.getItem('lastSync:chesscom')}`}</p>
  {error&&<div role="alert" className="alert">{error}<button onClick={()=>setError('')}>關閉</button></div>}{message&&<div role="status" className="notice">{message}</div>}
  <TrainingHub data={data} api={api} open={open}/>
  <div className="review-evidence">
  <div className="section-title"><div><div className="eyebrow">FOCUS ON YOUR NEXT IMPROVEMENT</div><h2>你的弱點，從自己的棋局找</h2></div><button className="primary" disabled={!!batch||!!syncing||!games.length} onClick={batchAnalyze}>✦ 分析最近 5 盤，幫我挑局面</button></div>
  <p>已分析你的 {review.analyzedGames} 盤、{review.ownMoves} 步，找到 {review.positions.length} 個值得重看的局面。只統計你的走法；這是目前樣本，不是固定能力評分。</p>
  {batch&&<div className="notice" role="status">{batch} <button onClick={stop}>停止分析</button><small>分析在本機進行，請保持頁面開啟。</small></div>}
  <div className="weakness-grid">{review.groups.map(g=><button key={g.id} className={`weakness-card ${category===g.id?'active':''}`} onClick={()=>setCategory(category===g.id?'all':g.id)}><span>{g.name}</span><strong>{g.count}<small> 個局面</small></strong><small>出現在 {g.games} 盤 · {['opening','middlegame','endgame'].includes(g.id)?'按階段整理':'有局面證據'}</small><p>{g.tip}</p></button>)}</div>
  <div className="section-title"><h3>{category==='all'?'優先復盤這幾個局面':'這個項目的復盤局面'}</h3><button onClick={()=>setCategory('all')}>顯示全部</button></div>
  <div className="position-grid">{picks.map(p=><button className="position-card" key={`${p.game.id}-${p.move.id}`} onClick={()=>open(p.game.id,p.move.ply,p.runId)}><div><span className={`badge ${p.analysis.classification}`}>{labels[p.analysis.classification]}</span><small>{p.game.played_at}</small></div><strong>{Math.ceil(p.move.ply/2)}{p.move.ply%2?'.':'…'} {p.move.san} → {p.analysis.best_move_san}</strong><small>{p.game.white_username} vs {p.game.black_username}</small><p>{p.evidence}</p><footer>估計勝算損失 {p.analysis.win_chance_loss.toFixed(1)} 個百分點 <b>前往復盤 ↗</b></footer></button>)}</div>
  {!picks.length&&<div className="empty">{review.ownMoves?'這個項目目前沒有達到失誤門檻的局面。':'先同步對局，再按上方的分析按鈕，系統就會從你的棋譜挑出重點。'}</div>}
 </div>
 </section>
}
