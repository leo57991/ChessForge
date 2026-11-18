import { selectReportGames } from "./reportSelection";
import { useEffect, useRef, useState } from "react";
import { PersonalReport } from "./PersonalReport";
import { Game } from "./types";
import { accounts, Platform } from "./sync";
import { ReviewedGame } from "./weaknesses";
type Props = {
  games: Game[];
  hidden: boolean;
  api: (path: string, body?: unknown) => Promise<any>;
  refresh: () => Promise<void>;
  open: (id: number, ply: number, runId: number) => void;
};
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
    syncLock = useRef(false);
  async function reloadReview() {
    setData(await api("/review-data"));
  }
  useEffect(() => {
    reloadReview().catch((e) => setError(e.message));
  }, [games]);
  async function sync(source: Platform) {
    if (syncLock.current) return;
    syncLock.current = true;
    setSyncing(source);
    setError("");
    localStorage.setItem("syncAttempt:" + source, String(Date.now()));
    try {
      const r = await api("/sync", { source, username: accounts[source] });
      await refresh();
      setMessage(
        `${source === "chesscom" ? "Chess.com" : "Lichess"}：新增 ${r.imported} 盤，略過 ${r.duplicates} 盤重複對局。`,
      );
      localStorage.setItem(
        "lastSync:" + source,
        new Date().toLocaleString("zh-TW"),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
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
    )
      void sync("chesscom");
  }, []);
  async function batchAnalyze(reportGroup?: string, count = 5) {
    if (batch) return;
    cancel.current = false;
    setError("");
    let done = 0,
      failed = 0;
    const completed = new Set(data.map((d) => d.game.id));
    const queue = selectReportGames(games, reportGroup || "all", count).filter(
      (g) => !completed.has(g.id),
    );
    if (!queue.length) {
      setMessage("這個範圍已有分析結果，可以直接查看下方報告。");
      return;
    }
    try {
      for (let i = 0; i < queue.length && !cancel.current; i++) {
        const g = queue[i];
        setBatch(`準備第 ${i + 1}/${queue.length} 盤…`);
        const detail = await api("/games/" + g.id);
        if (!detail.moves.length) continue;
        const r = await api("/games/" + g.id + "/analyze", { mode: "quick" });
        currentRun.current = r.id;
        while (true) {
          if (cancel.current) {
            await api("/runs/" + r.id + "/cancel", {});
            break;
          }
          const status = await api("/runs/" + r.id);
          setBatch(
            `第 ${i + 1}/${queue.length} 盤 · ${status.run.progress}/${status.run.total} 半步`,
          );
          if (!["queued", "running"].includes(status.run.status)) {
            if (status.run.status === "completed") done++;
            else failed++;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
        await reloadReview();
      }
      await refresh();
      setMessage(
        `已完成 ${done} 盤${failed ? `，${failed} 盤分析未完成` : ""}。${cancel.current ? "已停止後續分析。" : "已依你的錯步挑選復盤局面。"}`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBatch("");
      currentRun.current = null;
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
          disabled={!!syncing}
          onClick={async () => {
            await sync("chesscom");
            await sync("lichess");
          }}
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
        <button disabled={!!syncing} onClick={() => sync("chesscom")}>
          只更新 Chess.com
        </button>
        <button disabled={!!syncing} onClick={() => sync("lichess")}>
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
          generate={(s, n) => void batchAnalyze(s, n)}
          busy={!!batch || !!syncing}
          progress={batch}
          stop={() => void stop()}
        />
      </div>
    </section>
  );
}
