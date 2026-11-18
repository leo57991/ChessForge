import { Game } from "./types";
export const ALL_GAMES = "all";
export function selectReportGames(
  games: Game[],
  scope = ALL_GAMES,
  limit = Infinity,
) {
  return games
    .filter((g) => {
      const owns = [g.white_username, g.black_username].filter((n) =>
        ["hugemudraven", "oo09080983"].includes(n.toLowerCase()),
      ).length;
      return (
        owns === 1 &&
        ["1-0", "0-1", "1/2-1/2"].includes(g.result) &&
        (scope === ALL_GAMES ||
          JSON.stringify([g.source, g.time_control]) === scope)
      );
    })
    .sort((a, b) => b.played_at.localeCompare(a.played_at) || b.id - a.id)
    .slice(0, limit);
}
export function scopeLabel(scope: string) {
  if (scope === ALL_GAMES) return "全部對局";
  const [source, time] = JSON.parse(scope);
  const [seconds, increment] = time.split("+").map(Number);
  return `${({ chesscom: "Chess.com", lichess: "Lichess", pgn: "匯入棋譜" } as Record<string, string>)[source] || source} · ${Number.isFinite(seconds) && seconds > 0 ? `${seconds / 60} 分鐘${increment ? `＋${increment} 秒` : ""}` : time}`;
}
