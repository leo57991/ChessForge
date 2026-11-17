import os, sys, tempfile, time
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///" + str(Path(tempfile.mkdtemp()) / "test.db")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import chess, pytest
from fastapi.testclient import TestClient
from models import Base, engine, Session, Game, Move, Run, Analysis, Cache
from main import app, import_pgn
from analysis import classify, work, engine_path, evaluate

Base.metadata.create_all(engine)


def pgn(moves, result="0-1", fen=None):
    return (
        '[Event "test"]\n[White "Hugemudraven"]\n[Black "Other"]\n[Result "'
        + result
        + '"]\n'
        + (f'[SetUp "1"]\n[FEN "{fen}"]\n' if fen else "")
        + "\n"
        + moves
        + " "
        + result
    )


MATE = pgn("1. f3 e5 2. g4 Qh4#")


def test_import_duplicate_and_legal_navigation():
    r = import_pgn(MATE)
    assert r["imported"] == 1
    assert import_pgn(MATE)["duplicates"] == 1
    with Session() as s:
        g = s.query(Game).first()
        moves = s.query(Move).filter_by(game_id=g.id).order_by(Move.ply).all()
        b = chess.Board()
        for m in moves:
            assert b.fen() == m.fen_before
            b.push_uci(m.uci)
            assert b.fen() == m.fen_after
        assert b.is_checkmate()


def test_atomic_rejection():
    with Session() as s:
        n = s.query(Game).count()
    with pytest.raises(ValueError):
        import_pgn(MATE + "\n\n" + pgn("1. e5"))
    with Session() as s:
        assert s.query(Game).count() == n


@pytest.mark.parametrize(
    "text", ["1. e4 *", pgn("1. e4 e5", "1-0", "8/8/8/8/8/8/8/K7 w - - 0 1")]
)
def test_invalid_or_unfinished(text):
    with pytest.raises(ValueError):
        import_pgn(text)


@pytest.mark.parametrize(
    "text,flag",
    [
        (pgn("1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. O-O", "1-0"), "castling"),
        (pgn("1. e4 a6 2. e5 d5 3. exd6", "1-0"), "en_passant"),
        (pgn("1. a8=N", "1/2-1/2", "7k/P7/8/8/8/8/8/7K w - - 0 1"), "promotion"),
    ],
)
def test_special_moves(text, flag):
    import_pgn(text)
    with Session() as s:
        assert any(m.flags.get(flag) for m in s.query(Move))


def test_stalemate():
    import_pgn(pgn("1. Qg6", "1/2-1/2", "7k/5K2/8/6Q1/8/8/8/8 w - - 0 1"))


def test_scores():
    def sc(cp):
        return {"cp": cp, "mate": None, "white_wins": cp > 0}

    assert classify(sc(-200), sc(200), False, False)[2] == 400
    assert classify(sc(200), sc(-200), True, False)[2] == 400
    assert (
        classify(sc(100), {"cp": None, "mate": -1, "white_wins": False}, True, False)[2]
        is None
    )
    assert classify(sc(0), sc(0), True, True)[0] == "Best"


def test_real_engine_analysis_cache_and_cancel():
    import_pgn(MATE)
    engine_path()
    with Session() as s:
        g = s.query(Game).first()
        gid = g.id
        r = Run(game_id=gid, depth=10, total=4, limits={"seconds_per_position": 0.1})
        s.add(r)
        s.commit()
        rid = r.id
    work(rid)
    with Session() as s:
        r = s.get(Run, rid)
        assert r.status == "completed", r.error
        rows = s.query(Analysis).filter_by(analysis_run_id=rid).all()
        assert len(rows) == 4
        assert all(a.principal_variation for a in rows)
        assert rows[-1].evaluation_after["mate"] == 0
        assert rows[-1].evaluation_after["white_wins"] is False
        assert s.query(Cache).count() > 0
        r2 = Run(
            game_id=gid,
            depth=10,
            total=4,
            status="cancelled",
            limits={"seconds_per_position": 0.1},
        )
        s.add(r2)
        s.commit()
        rid2 = r2.id
    work(rid2)
    with Session() as s:
        assert s.get(Run, rid2).status == "cancelled"
        assert s.query(Analysis).filter_by(analysis_run_id=rid).count() == 4


def test_api_auth_and_origin(monkeypatch):
    with TestClient(app) as client:
        assert client.get("/api/games").status_code == 200
        assert (
            client.post(
                "/api/import",
                json={"pgn": MATE},
                headers={"Origin": "https://evil.example"},
            ).status_code
            == 403
        )
        monkeypatch.setenv("CHESSFORGE_TOKEN", "test-secret")
        assert client.get("/api/games").status_code == 401
        assert (
            client.get(
                "/api/games", headers={"Authorization": "Bearer test-secret"}
            ).status_code
            == 200
        )


def test_sync_uses_only_completed_standard_games():
    import httpx
    from sync import fetch_pgn
    urls=[]
    def handler(request):
        urls.append(str(request.url))
        if str(request.url).endswith('/archives'):
            return httpx.Response(200,json={'archives':['https://api.chess.com/pub/player/hugemudraven/games/2026/11']})
        return httpx.Response(200,json={'games':[{'rules':'chess','end_time':1,'pgn':MATE},{'rules':'chess','pgn':'LIVE'},{'rules':'chess960','end_time':2,'pgn':'VARIANT'}]})
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        assert fetch_pgn('chesscom','Hugemudraven',client)==MATE
    assert len(urls)==2


def test_sync_failure_preserves_existing_data():
    import httpx
    from sync import fetch_pgn
    with Session() as s:before=s.query(Game).count()
    with httpx.Client(transport=httpx.MockTransport(lambda _:httpx.Response(429))) as client:
        with pytest.raises(ValueError,match='429'):fetch_pgn('chesscom','Hugemudraven',client)
    with Session() as s:assert s.query(Game).count()==before


def test_training_storage_revision_and_validation():
    client = TestClient(app)
    current = client.get('/api/training').json()
    current['state']['settings']['dailySize'] = 10
    saved = client.post('/api/training', json=current)
    assert saved.status_code == 200
    assert saved.json()['revision'] == current['revision'] + 1
    assert client.get('/api/training').json()['state']['settings']['dailySize'] == 10
    assert client.post('/api/training', json=current).status_code == 409
    bad = saved.json()
    bad['state']['version'] = 999
    assert client.post('/api/training', json=bad).status_code == 422


def test_training_move_check_is_completed_game_scoped():
    client = TestClient(app)
    assert client.post('/api/training/check', json={'game_id':999999,'ply':1,'uci':'e2e4'}).status_code == 404
    import_pgn(MATE)
    with Session() as s:
        g = s.query(Game).filter(Game.pgn.contains('f3')).first()
        game_id = g.id
    assert client.post('/api/training/check', json={'game_id':game_id,'ply':1,'uci':'e2e5'}).status_code == 422
    result = client.post('/api/training/check', json={'game_id':game_id,'ply':4,'uci':'d8h4'})
    assert result.status_code == 200
    assert result.json()['after']['mate'] == 0
    assert result.json()['after']['white_wins'] is False
