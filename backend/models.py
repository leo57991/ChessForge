import os
from datetime import datetime, timezone
from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Text,
    ForeignKey,
    JSON,
    Float,
    UniqueConstraint,
    event,
)
from sqlalchemy.orm import declarative_base, sessionmaker
from pathlib import Path

Base = declarative_base()


def now():
    return datetime.now(timezone.utc).isoformat()


engine = create_engine(
    os.getenv(
        "DATABASE_URL",
        "sqlite:///" + str(Path(__file__).resolve().parent / "chessforge.db"),
    ),
    connect_args={"check_same_thread": False, "timeout": 30},
)


@event.listens_for(engine, "connect")
def configure(db, _):
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA journal_mode=WAL")


Session = sessionmaker(engine)


class Game(Base):
    __tablename__ = "games"
    id = Column(Integer, primary_key=True)
    fingerprint = Column(String, unique=True, nullable=False)
    chesscom_game_id = Column(String, unique=True)
    source = Column(String, nullable=False)
    played_at = Column(String)
    white_username = Column(String)
    black_username = Column(String)
    result = Column(String)
    time_control = Column(String)
    pgn = Column(Text)
    created_at = Column(String, default=now)


class Move(Base):
    __tablename__ = "moves"
    __table_args__ = (UniqueConstraint("game_id", "ply"),)
    id = Column(Integer, primary_key=True)
    game_id = Column(Integer, ForeignKey("games.id"), index=True)
    ply = Column(Integer)
    san = Column(String)
    uci = Column(String)
    fen_before = Column(String)
    fen_after = Column(String)
    flags = Column(JSON)


class Run(Base):
    __tablename__ = "analysis_runs"
    id = Column(Integer, primary_key=True)
    game_id = Column(Integer, ForeignKey("games.id"), index=True)
    engine_version = Column(String)
    depth = Column(Integer)
    multipv = Column(Integer, default=3)
    status = Column(String, default="queued")
    progress = Column(Integer, default=0)
    total = Column(Integer)
    error = Column(Text)
    started_at = Column(String, default=now)
    completed_at = Column(String)
    limits = Column(JSON)


class Analysis(Base):
    __tablename__ = "move_analyses"
    __table_args__ = (UniqueConstraint("analysis_run_id", "move_id"),)
    id = Column(Integer, primary_key=True)
    analysis_run_id = Column(Integer, ForeignKey("analysis_runs.id"), index=True)
    move_id = Column(Integer, ForeignKey("moves.id"))
    evaluation_before = Column(JSON)
    evaluation_after = Column(JSON)
    best_move_uci = Column(String)
    best_move_san = Column(String)
    score_loss = Column(Float, nullable=True)
    win_chance_loss = Column(Float)
    classification = Column(String)
    explanation = Column(Text)
    recommendation = Column(Text)
    principal_variation = Column(JSON)
    candidates = Column(JSON)
    actual_variation = Column(JSON)


class Cache(Base):
    __tablename__ = "position_cache"
    key = Column(String, primary_key=True)
    value = Column(JSON)


def serialize(obj):
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}
