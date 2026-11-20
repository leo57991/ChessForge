import { selectReportGames } from "./reportSelection";
import { useEffect, useRef, useState } from "react";
import { PersonalReport } from "./PersonalReport";
import { Detail, Game, Run } from "./types";
import { accounts, Platform } from "./sync";
import { ReviewedGame } from "./weaknesses";
type Props = {
  games: Game[];
  hidden: boolean;
  api: (path: string, body?: unknown) => Promise<any>;
  refresh: () => Promise<void>;
  open: (id: number, ply: number, runId: number) => void;
};
const pendingSyncKey = "pendingSyncedAnalysis";
function pendingSyncedGames(): number[] {
  try {
    const ids = JSON.parse(localStorage.getItem(pendingSyncKey) || "[]");
    return Array.isArray(ids) ? ids.filter(Number.isSafeInteger) : [];
  } catch {
    return [];
  }
}
function updatePending(ids: number[], remove = false) {
  const pending = new Set(pendingSyncedGames());
  for (const id of ids) remove ? pending.delete(id) : pending.add(id);
  localStorage.setItem(pendingSyncKey, JSON.stringify([...pending]));
}

export function ReviewHome({ games, hidden, api, refresh, open }: Props) {
  const [data, setData] = useState<ReviewedGame[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [syncing, setSyncing] = useState<Platform | null>(null),
    [auto, setAuto] = useState(
      () => localStorage.getItem("autoSyncChesscom") !== "false",
    ),
    [batch, setBatch] = useState("");
  const initialized = useRef(false),
    cancel = useRef(false),
    currentRun = useRef<number | null>(null),
    syncLock = useRef(false),
    batchLock = useRef(false);
  async function reloadReview() {
    setData(await api("/review-data"));
  }
  useEffect(() => {
    reloadReview().catch((e) => setError(e.message));
  }, [games]);
  async function sync(...sources: Platform[]) {
    if (syncLock.current || batchLock.current) return;
    syncLock.current = true;
    setError("");
    setMessage("");
    let imported = 0;
    const errors: string[] = [];
    try {
      for (const source of sources) {
        setSyncing(source);
        localStorage.setItem("syncAttempt:" + source, String(Date.now()));
        try {
          const result = await api("/sync", {
            source,
            username: accounts[source],
          });
          imported += result.imported;
          updatePending(result.game_ids || []);
          localStorage.setItem(
            "lastSync:" + source,
            new Date().toLocaleString("zh-TW"),
          );
        } catch (e) {
          errors.push(
            `${source === "chesscom" ? "Chess.com" : "Lichess"}：${(e as Error).message}`,
          );
        }
      }
      await refresh();
      const pending = pendingSyncedGames();
      if (pending.length) {
        setMessage(
          imported
            ? `已匯入 ${imported} 盤，正在更新報告。`
            : "正在繼續分析上次同步的棋局。",
        );
        await analyzeGames(pending);
      } else if (!errors.length) {
        setMessage("棋局已是最新。");
      }
    } catch (e) {
      errors.push((e as Error).message);
    } finally {
      if (errors.length) setError(errors.join("；"));
      setSyncing(null);
      syncLock.current = false;
    }
  }
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (
      auto &&
      Date.now() - Number(localStorage.getItem("syncAttempt:chesscom") || 0) >
        30 * 60 * 1000
    ) {
      void sync("chesscom");
    } else {
      const pending = pendingSyncedGames();
      if (pending.length) void analyzeGames(pending);
    }
  }, []);
  async function analyzeGames(ids: number[]) {
    if (batchLock.current) return;
    batchLock.current = true;
    cancel.current = false;
    setBatch("正在準備分析…");
    let done = 0;
    const failures: string[] = [];
    try {
      const previous: ReviewedGame[] = await api("/review-data");
      const completed = new Set(previous.map((d) => d.game.id));
      updatePending(
        ids.filter((id) => completed.has(id)),
        true,
      );
      const queue = ids.filter((id) => !completed.has(id));
      for (const [i, id] of queue.entries()) {
        if (cancel.current) break;
        setBatch(`正在分析第 ${i + 1}／${queue.length} 盤…`);
        try {
          const detail: Detail = await api("/games/" + id);
          if (cancel.current) break;
          if (!detail.moves.length) {
            updatePending([id], true);
            continue;
          }
          let run: Run = await api("/games/" + id + "/analyze", {
            mode: "quick",
            reuse_completed: true,
          });
          currentRun.current = run.id;
          while (["queued", "running"].includes(run.status)) {
            if (cancel.current) {
              await api("/runs/" + run.id + "/cancel", {});
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 800));
            run = (await api("/runs/" + run.id)).run;
          }
          if (run.status === "completed") {
            done++;
            updatePending([id], true);
            await reloadReview();
          } else if (!cancel.current) {
            failures.push(run.error || "分析中斷。");
          }
        } catch (e) {
          failures.push((e as Error).message);
          break;
        } finally {
          currentRun.current = null;
        }
      }
      await refresh();
      setMessage(
        cancel.current
          ? "分析已暫停，已完成的結果會保留。"
          : done
            ? `報告已更新，這次完成 ${done} 盤。`
            : failures.length
              ? ""
              : "這個範圍沒有新的棋局需要分析。",
      );
      if (failures.length) setError(`有棋局尚未完成分析。${failures[0]}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBatch("");
      batchLock.current = false;
    }
  }
  async function stop() {
    cancel.current = true;
    if (currentRun.current)
      try {
        await api("/runs/" + currentRun.current + "/cancel", {});
      } catch (e) {
        setError((e as Error).message);
      }
  }
  if (hidden)
    return batch ? (
      <div className="notice">
        弱點分析進行中：{batch} <button onClick={stop}>停止</button>
      </div>
    ) : null;
  return (
    <section className="weakness-home">
      <div className="simple-sync">
        <div>
          <strong>我的公開棋局</strong>
          <p>Hugemudraven · oo09080983</p>
        </div>
        <button
          disabled={!!syncing || !!batch}
          onClick={() => void sync("chesscom", "lichess")}
        >
          {syncing ? "正在更新…" : "↻ 更新棋局"}
        </button>
      </div>
      <details className="quiet-details">
        <summary>帳號與同步設定</summary>
        <label>
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => {
              setAuto(e.target.checked);
              localStorage.setItem(
                "autoSyncChesscom",
                String(e.target.checked),
              );
            }}
          />
          開啟時自動更新 Chess.com
        </label>
        <p>
          Chess.com 最近 3 個有棋局月份、最多 200 盤；Lichess 最近 100
          盤。手動更新會讀取兩個帳號。只匯入已結束棋局。
        </p>
        <button
          disabled={!!syncing || !!batch}
          onClick={() => sync("chesscom")}
        >
          只更新 Chess.com
        </button>
        <button disabled={!!syncing || !!batch} onClick={() => sync("lichess")}>
          只更新 Lichess
        </button>
      </details>
      {error && (
        <div role="alert" className="alert">
          {error}
          <button onClick={() => setError("")}>關閉</button>
        </div>
      )}
      {message && (
        <div role="status" className="notice">
          {message}
        </div>
      )}
      <div className="review-evidence">
        <PersonalReport
          data={data}
          games={games}
          open={open}
          generate={(scope, count) => {
            setError("");
            void analyzeGames(
              selectReportGames(games, scope, count).map((g) => g.id),
            );
          }}
          busy={!!batch || !!syncing}
          progress={batch}
          stop={() => void stop()}
        />
      </div>
    </section>
  );
}
