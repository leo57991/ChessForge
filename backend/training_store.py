"""Versioned, optimistic-concurrency storage. Scheduling is shared TypeScript.
The local client owns learning calculations; this is not a competitive scoring API.
"""
from typing import Dict, List, Literal, Optional
import chess
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import Column, Integer, JSON, update
from sqlalchemy.exc import IntegrityError
from models import Base, Session

router = APIRouter()

class TrainingRecord(Base):
    __tablename__ = 'training_state'
    id = Column(Integer, primary_key=True)
    revision = Column(Integer, nullable=False, default=0)
    state = Column(JSON, nullable=False)

class Memory(BaseModel):
    signature: str = Field(max_length=1000)
    due: float = Field(ge=0, allow_inf_nan=False)
    interval: float = Field(ge=0, allow_inf_nan=False)
    successes: List[float]
    lapses: int = Field(ge=0)
    last: float = Field(ge=0, allow_inf_nan=False)
    suspended: bool
    preferred: Optional[str] = None
    regressionDate: Optional[str] = None

class Attempt(BaseModel):
    id: str = Field(max_length=200)
    cardId: str = Field(max_length=150)
    signature: str = Field(max_length=1000)
    at: float = Field(ge=0, allow_inf_nan=False)
    day: str = Field(pattern=r'^\d{4}-\d{2}-\d{2}$')
    correct: bool
    assisted: bool
    eligible: bool
    uci: str = Field(max_length=10)
    elapsed: float = Field(ge=0, allow_inf_nan=False)
    category: Literal['mate','undefended','stalemate','opening','middlegame','endgame']
    source: Literal['daily','opening']
    note: str = Field(max_length=2000)

class Plan(BaseModel):
    ids: List[str]
    completed: List[str]
    created: float = Field(ge=0, allow_inf_nan=False)

class Settings(BaseModel):
    dailySize: Literal[5,10,15]
    newLimit: int = Field(ge=1,le=10)

class State(BaseModel):
    version: Literal[1]
    memories: Dict[str, Memory]
    attempts: List[Attempt]
    plans: Dict[str, Plan]
    settings: Settings

class SaveBody(BaseModel):
    revision: int = Field(ge=0)
    state: State

@router.get('/api/training')
def get_training():
    with Session() as s:
        row=s.get(TrainingRecord,1)
        return {'revision':row.revision,'state':row.state} if row else {'revision':0,'state':{'version':1,'memories':{},'attempts':[],'plans':{},'settings':{'dailySize':5,'newLimit':3}}}

@router.post('/api/training')
def save_training(body:SaveBody):
    import math, re
    state=body.state.model_dump(exclude_none=True)
    try:
        for key,m in state['memories'].items():
            chess.Board(key+' 0 1')
            if not all(math.isfinite(x) and x>=0 for x in m['successes']):raise ValueError()
        ids=[a['id'] for a in state['attempts']]
        if len(ids)!=len(set(ids)):raise ValueError()
        for day,p in state['plans'].items():
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',day) or not set(p['completed'])<=set(p['ids']):raise ValueError()
    except (ValueError,TypeError):raise HTTPException(422,'訓練資料不合法')
    with Session() as s:
        changed=s.execute(update(TrainingRecord).where(TrainingRecord.id==1,TrainingRecord.revision==body.revision).values(revision=body.revision+1,state=state)).rowcount
        if not changed:
            if body.revision!=0 or s.get(TrainingRecord,1):raise HTTPException(409,'另一個分頁或裝置已更新訓練進度，請重新載入後再試。')
            s.add(TrainingRecord(id=1,revision=1,state=state))
        try:s.commit()
        except IntegrityError:
            s.rollback();raise HTTPException(409,'訓練進度已更新，請重新載入。')
    return {'revision':body.revision+1,'state':state}

class CheckMove(BaseModel):
    game_id:int
    ply:int=Field(ge=1)
    uci:str=Field(pattern=r'^[a-h][1-8][a-h][1-8][qrbn]?$')

@router.post('/api/training/check')
def check_move(body:CheckMove):
    # No arbitrary FEN input: only completed imported games, reconstruct full history.
    from models import Game, Move
    from analysis import engine_path,evaluate
    import chess.engine, chess.pgn, io
    with Session() as s:
        g=s.get(Game,body.game_id)
        if not g or g.result not in ['1-0','0-1','1/2-1/2']:raise HTTPException(404,'找不到已完成對局')
        rows=s.query(Move).filter_by(game_id=body.game_id).order_by(Move.ply).all()
        if body.ply>len(rows):raise HTTPException(422,'不存在的棋步')
        b=chess.pgn.read_game(io.StringIO(g.pgn)).board()
        for row in rows[:body.ply-1]:b.push_uci(row.uci)
        move=chess.Move.from_uci(body.uci)
        if move not in b.legal_moves:raise HTTPException(422,'不合法的走法')
    try:
        with chess.engine.SimpleEngine.popen_uci(engine_path(),timeout=30) as eng:
            eng.configure({'Threads':1,'Hash':32})
            before=evaluate(eng,b,16,0.5,3)
            b.push(move)
            after=evaluate(eng,b,16,0.5,1)
            return {'before':before[0]['score'],'after':after[0]['score'],'pv':after[0]['pv'],'engine':eng.id.get('name','Stockfish')}
    except Exception as exc:raise HTTPException(503,'引擎暫時無法判讀；這次不計錯：'+str(exc))
