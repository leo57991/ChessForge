import io, os, re, hashlib, threading, secrets
from contextlib import asynccontextmanager
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import chess, chess.pgn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from models import Base, engine, Session, Game, Move, Run, Analysis, serialize, now
from analysis import work, engine_path
pool=ThreadPoolExecutor(max_workers=1)
mutation_lock=threading.Lock()
@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(engine)
    with Session() as s:
        for r in s.query(Run).filter(Run.status.in_(['running','queued'])):
            r.status='failed'; r.error='程式上次關閉時中斷，請重新分析。'; r.completed_at=now()
        s.commit()
    yield
    with Session() as s:
        for r in s.query(Run).filter(Run.status.in_(['running','queued'])): r.status='cancelled'
        s.commit()
    pool.shutdown(wait=True)
app=FastAPI(title='ChessForge',lifespan=lifespan)
@app.middleware('http')
async def protect(request:Request,call_next):
    if request.url.path.startswith('/api/'):
        origin=request.headers.get('origin')
        if origin and origin.rstrip('/') != str(request.base_url).rstrip('/'):
            return JSONResponse({'detail':'不允許跨來源請求'},status_code=403)
        token=os.getenv('CHESSFORGE_TOKEN')
        if token and not secrets.compare_digest(request.headers.get('authorization',''), 'Bearer '+token):
            return JSONResponse({'detail':'請輸入 LAN 存取碼'},status_code=401)
    return await call_next(request)
class ImportBody(BaseModel):
    pgn:str=Field(min_length=1,max_length=10_000_000)
class AnalyzeBody(BaseModel):
    mode:str='quick'

def import_pgn(text,source='pgn'):
    stream=io.StringIO(text.lstrip('\ufeff')); parsed=[]
    while True:
        g=chess.pgn.read_game(stream)
        if g is None: break
        if g.errors: raise ValueError('PGN 含非法走法：'+str(g.errors[0]))
        if g.headers.get('Result') not in ['1-0','0-1','1/2-1/2']: raise ValueError('只接受已結束並標記結果的棋局，不接受 *。')
        board=g.board()
        if not board.is_valid() or board.chess960 or g.headers.get('Variant','Standard') not in ['Standard','Chess']: raise ValueError('只支援標準西洋棋的合法起始局面。')
        rows=[]
        for ply,m in enumerate(g.mainline_moves(),1):
            if m not in board.legal_moves or board.is_game_over(): raise ValueError(f'第 {ply} 半步不合法或棋局已結束。')
            row=dict(ply=ply,san=board.san(m),uci=m.uci(),fen_before=board.fen(),flags={'capture':board.is_capture(m),'check':board.gives_check(m),'promotion':bool(m.promotion),'castling':board.is_castling(m),'en_passant':board.is_en_passant(m)})
            board.push(m); row['fen_after']=board.fen(); rows.append(row)
        outcome=board.outcome()
        if outcome and outcome.result()!=g.headers['Result']: raise ValueError('棋譜結果與終局局面不符。')
        # Identity independent of comments, clocks, source and formatting.
        identity=[g.board().fen(),g.headers.get('White','?').lower(),g.headers.get('Black','?').lower(),g.headers.get('Date','?'),g.headers.get('Round','?'),g.headers['Result'],' '.join(r['uci'] for r in rows)]
        fingerprint=hashlib.sha256('\n'.join(identity).encode()).hexdigest()
        link=g.headers.get('Link',g.headers.get('Site',''))
        remote=re.search(r'chess\.com/(?:game/)?(?:live|daily)/(\d+)',link)
        parsed.append((g,rows,fingerprint,remote.group(1) if remote else None))
    if not parsed: raise ValueError('找不到 PGN 棋局。')
    imported=0; duplicate=0
    with mutation_lock, Session() as s:
        for g,rows,fingerprint,remote in parsed:
            if s.query(Game).filter_by(fingerprint=fingerprint).first() or (remote and s.query(Game).filter_by(chesscom_game_id=remote).first()): duplicate+=1; continue
            obj=Game(fingerprint=fingerprint,chesscom_game_id=remote,source=source,played_at=g.headers.get('UTCDate',g.headers.get('Date','?')),white_username=g.headers.get('White','?'),black_username=g.headers.get('Black','?'),result=g.headers['Result'],time_control=g.headers.get('TimeControl','?'),pgn=str(g))
            s.add(obj); s.flush()
            s.add_all([Move(game_id=obj.id,**r) for r in rows]); imported+=1
        s.commit()
    return {'imported':imported,'duplicates':duplicate}
@app.get('/api/health')
def health():
    try: path=engine_path(); return {'engine_ready':True,'engine':Path(path).name}
    except RuntimeError as e: return {'engine_ready':False,'error':str(e)}
@app.post('/api/import')
def upload(body:ImportBody):
    try:return import_pgn(body.pgn)
    except (ValueError,UnicodeError) as e:raise HTTPException(422,str(e))
@app.get('/api/games')
def games():
    with Session() as s:
        data=[]
        for g in s.query(Game).order_by(Game.played_at.desc(),Game.id.desc()):
            item=serialize(g); item.pop('pgn'); item.pop('fingerprint')
            run=s.query(Run).filter_by(game_id=g.id).order_by(Run.id.desc()).first()
            item['run']=serialize(run) if run else None; data.append(item)
        return data
@app.get('/api/games/{game_id}')
def detail(game_id:int):
    with Session() as s:
        g=s.get(Game,game_id)
        if not g: raise HTTPException(404,'找不到棋局')
        moves=s.query(Move).filter_by(game_id=game_id).order_by(Move.ply).all()
        runs=s.query(Run).filter_by(game_id=game_id).order_by(Run.id.desc()).all()
        return {'game':serialize(g),'initial_fen':chess.pgn.read_game(io.StringIO(g.pgn)).board().fen(),'moves':[serialize(m) for m in moves],'runs':[serialize(r) for r in runs]}
@app.post('/api/games/{game_id}/analyze')
def analyze(game_id:int,body:AnalyzeBody):
    if body.mode not in ['quick','deep']:raise HTTPException(422,'未知分析模式')
    try:engine_path()
    except RuntimeError as e:raise HTTPException(503,str(e))
    with mutation_lock,Session() as s:
        if not s.get(Game,game_id):raise HTTPException(404,'找不到棋局')
        active=s.query(Run).filter(Run.game_id==game_id,Run.status.in_(['running','queued'])).first()
        if active:return serialize(active)
        if not s.query(Move).filter_by(game_id=game_id).count():raise HTTPException(422,'這盤沒有走法（零步和棋），不需要引擎分析。')
        r=Run(game_id=game_id,depth=12 if body.mode=='quick' else 18,total=s.query(Move).filter_by(game_id=game_id).count(),limits={'seconds_per_position':.15 if body.mode=='quick' else 1.0})
        s.add(r);s.commit(); result=serialize(r)
        pool.submit(work,r.id)
        return result
@app.get('/api/runs/{run_id}')
def run_detail(run_id:int):
    with Session() as s:
        r=s.get(Run,run_id)
        if not r:raise HTTPException(404,'找不到分析')
        return {'run':serialize(r),'analyses':[serialize(a) for a in s.query(Analysis).filter_by(analysis_run_id=run_id).order_by(Analysis.id)]}
@app.post('/api/runs/{run_id}/cancel')
def cancel(run_id:int):
    with mutation_lock,Session() as s:
        r=s.get(Run,run_id)
        if not r:raise HTTPException(404,'找不到分析')
        if r.status in ['queued','running']:r.status='cancelled';r.completed_at=now();s.commit()
        return serialize(r)
# Serve the production UI from the same origin; no permissive CORS.
static=Path(__file__).resolve().parent.parent/'frontend'/'dist'
if static.exists():app.mount('/',StaticFiles(directory=static,html=True),name='ui')
