export type Platform='chesscom'|'lichess';
export const accounts={chesscom:'Hugemudraven',lichess:'oo09080983'};
export async function fetchPublicPGN(source:Platform,username:string,fetcher:typeof fetch=fetch){
 if(!/^[A-Za-z0-9_-]{2,40}$/.test(username))throw new Error('帳號格式不正確。');
 async function get(url:string,accept='application/json'){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),30000);
  try{
   const r=await fetcher(url,{headers:{Accept:accept},signal:controller.signal,credentials:'omit'});
   if(r.status===429)throw new Error('平台限制請求（429），請稍後重試。');
   if(r.status===403)throw new Error('平台暫時拒絕公開 API（403），請稍後重試或手動匯入 PGN。');
   if(r.status===404)throw new Error('找不到帳號或公開棋譜。');
   if(!r.ok)throw new Error(`同步失敗（HTTP ${r.status}），既有資料不受影響。`);
   const text=await r.text();if(text.length>10_000_000)throw new Error('平台資料過大，請分批匯入 PGN。');return text;
  }catch(e){if((e as Error).name==='AbortError')throw new Error('同步逾時，請稍後重試。');if(e instanceof TypeError)throw new Error('無法連到公開 API（網路或平台跨來源限制）。請稍後重試，或使用 Windows 本機版／PGN 匯入。');throw e}
  finally{clearTimeout(timeout)}
 }
 if(source==='lichess')return get(`https://lichess.org/api/games/user/${username}?max=100&ongoing=false&finished=true&evals=false&clocks=false`,'application/x-chess-pgn');
 const base=`https://api.chess.com/pub/player/${username.toLowerCase()}/games`;
 const archives=JSON.parse(await get(base+'/archives')).archives as string[];
 const all:any[]=[];
 for(const url of archives.slice(-3)){
  if(!url.startsWith(base+'/')||!/^\d{4}\/\d{2}$/.test(url.slice(base.length+1)))throw new Error('平台回傳非預期棋譜網址。');
  all.push(...JSON.parse(await get(url)).games);
 }
 return all.filter(g=>g.rules==='chess'&&g.end_time&&g.pgn).sort((a,b)=>b.end_time-a.end_time).slice(0,200).map(g=>g.pgn).join('\n\n');
}
