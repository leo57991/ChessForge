import os, shutil, hashlib, json, math
from pathlib import Path
import chess, chess.engine
from models import Session, Game, Move, Run, Analysis, Cache, now


def engine_path():
    configured = os.getenv("STOCKFISH_PATH")
    if configured:
        return configured
    local = (
        Path(__file__).resolve().parent.parent
        / "engine"
        / ("stockfish.exe" if os.name == "nt" else "stockfish")
    )
    if local.exists():
        return str(local)
    found = shutil.which("stockfish")
    if found:
        return found
    raise RuntimeError(
        "找不到 Stockfish。請將引擎放入 engine 資料夾或設定 STOCKFISH_PATH。"
    )


def score(info):
    s = info["score"].white()
    return {
        "cp": s.score(),
        "mate": s.mate(),
        "depth": info.get("depth", 0),
        "white_wins": s > chess.engine.Cp(0),
    }


def chance(s, color):
    if s["mate"] is not None:
        p = 1.0 if s["white_wins"] else 0.0
    else:
        p = 1 / (1 + math.exp(-max(-10000, min(10000, s["cp"])) / 250))
    return p if color else 1 - p


def classify(before, after, color, same):
    loss = max(0, 100 * (chance(before, color) - chance(after, color)))
    label = (
        "Best"
        if same
        else (
            "Excellent"
            if loss < 1
            else (
                "Good"
                if loss < 3
                else "Inaccuracy" if loss < 8 else "Mistake" if loss < 18 else "Blunder"
            )
        )
    )
    cp = (
        max(0, (before["cp"] - after["cp"]) * (1 if color else -1))
        if before["cp"] is not None and after["cp"] is not None
        else None
    )
    return label, loss, cp


def variation(board, moves):
    b = board.copy()
    result = []
    for m in moves:
        result.append({"uci": m.uci(), "san": b.san(m)})
        b.push(m)
    return result


def evaluate(eng, board, depth, seconds, multipv):
    # Full history prevents a repeated FEN from hiding repetition rights.
    key = hashlib.sha256(
        json.dumps(
            [
                eng.id,
                board.root().fen(),
                [m.uci() for m in board.move_stack],
                board.fen(),
                depth,
                seconds,
                multipv,
            ],
            sort_keys=True,
        ).encode()
    ).hexdigest()
    with Session() as s:
        hit = s.get(Cache, key)
        if hit:
            return hit.value
    outcome = board.outcome(claim_draw=False)
    if outcome:
        value = [
            {
                "score": {
                    "cp": 0 if outcome.winner is None else None,
                    "mate": None if outcome.winner is None else 0,
                    "white_wins": outcome.winner == chess.WHITE,
                    "depth": 0,
                },
                "pv": [],
            }
        ]
    else:
        infos = eng.analyse(
            board, chess.engine.Limit(depth=depth, time=seconds), multipv=multipv
        )
        value = [
            {"score": score(i), "pv": variation(board, i.get("pv", []))} for i in infos
        ]
    with Session() as s:
        s.merge(Cache(key=key, value=value))
        s.commit()
    return value


def work(run_id):
    try:
        with Session() as s:
            run = s.get(Run, run_id)
            if run.status == "cancelled":
                return
            changed = (
                s.query(Run)
                .filter(Run.id == run_id, Run.status == "queued")
                .update({"status": "running"})
            )
            s.commit()
            if not changed:
                return
            moves = (
                s.query(Move).filter_by(game_id=run.game_id).order_by(Move.ply).all()
            )
            multipv = run.multipv
            depth = run.depth
            seconds = run.limits["seconds_per_position"]
            board = chess.Board(moves[0].fen_before)
        with chess.engine.SimpleEngine.popen_uci(engine_path(), timeout=30) as eng:
            eng.configure({"Threads": 1, "Hash": 128})
            with Session() as s:
                r = s.get(Run, run_id)
                r.engine_version = eng.id.get("name", "Stockfish")
                s.commit()
            previous_after = None
            for index, move in enumerate(moves):
                with Session() as s:
                    if s.get(Run, run_id).status == "cancelled":
                        return
                # The previous post-move position is exactly this position, including history.
                before = previous_after if previous_after is not None else evaluate(eng, board, depth, seconds, multipv)
                best = before[0]["pv"][0]
                actual = chess.Move.from_uci(move.uci)
                color = board.turn
                suggestion = (
                    "引擎比較後選擇 "
                    + best["san"]
                    + "。請播放變化，觀察雙方的合理應手；具體戰術原因需進一步檢查。"
                )
                if board.is_capture(chess.Move.from_uci(best["uci"])):
                    suggestion = (
                        "建議 "
                        + best["san"]
                        + "，此步直接吃子；是否能保住物質收益，請一起查看後續變化。"
                    )
                board.push(actual)
                after = evaluate(eng, board, depth, seconds, multipv)
                previous_after = after
                label, loss, cp = classify(
                    before[0]["score"],
                    after[0]["score"],
                    color,
                    move.uci == best["uci"],
                )
                explanation = f"以走棋方視角比較，這一步的估計勝算損失為 {loss:.1f} 個百分點。這是引擎評估的換算值，並非你的實際勝率。具體原因需進一步檢查。"
                if board.is_stalemate() and chance(before[0]["score"], color) > 0.8:
                    explanation = "這一步讓對方沒有合法走法、卻沒有被將軍，形成逼和，原本的優勢因此變成和棋。"
                elif after[0]["pv"]:
                    reply = chess.Move.from_uci(after[0]["pv"][0]["uci"])
                    probe = board.copy()
                    probe.push(reply)
                    if probe.is_checkmate():
                        explanation = (
                            "漏看對方一步將死：對方可走 "
                            + after[0]["pv"][0]["san"]
                            + "，你的王無法逃離將軍。"
                        )
                with Session() as s:
                    r = s.get(Run, run_id)
                    if r.status == "cancelled":
                        return
                    s.add(
                        Analysis(
                            analysis_run_id=run_id,
                            move_id=move.id,
                            evaluation_before=before[0]["score"],
                            evaluation_after=after[0]["score"],
                            best_move_uci=best["uci"],
                            best_move_san=best["san"],
                            score_loss=cp,
                            win_chance_loss=loss,
                            classification=label,
                            explanation=explanation,
                            recommendation=suggestion,
                            principal_variation=before[0]["pv"],
                            candidates=before,
                            actual_variation=after[0]["pv"],
                        )
                    )
                    r.progress = index + 1
                    s.commit()
        with Session() as s:
            r = s.get(Run, run_id)
            s.query(Run).filter(Run.id == run_id, Run.status == "running").update(
                {"status": "completed", "completed_at": now()}
            )
            s.commit()
    except Exception as exc:
        with Session() as s:
            r = s.get(Run, run_id)
            if r:
                s.query(Run).filter(Run.id == run_id, Run.status != "cancelled").update(
                    {"status": "failed", "error": str(exc), "completed_at": now()}
                )
                s.commit()
