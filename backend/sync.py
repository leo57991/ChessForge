"""Public, completed-game imports. No credentials or live game endpoints."""
import re
import httpx

USER_AGENT = 'ChessForge/0.2 (+https://github.com/leo57991/ChessForge; username: Hugemudraven)'


def fetch_pgn(source, username, client=None):
    if not re.fullmatch(r'[A-Za-z0-9_-]{2,40}', username):
        raise ValueError('帳號格式不正確。')
    own = client is None
    client = client or httpx.Client(timeout=30, follow_redirects=True, headers={'User-Agent': USER_AGENT})
    def get(url, accept='application/json'):
        response = client.get(url, headers={'Accept': accept})
        if response.status_code == 429:
            raise ValueError('平台暫時限制請求（429），請稍後再試；既有棋局不受影響。')
        if response.status_code == 404:
            raise ValueError('找不到這個帳號或公開棋譜。')
        if response.status_code == 403:
            raise ValueError('平台暫時拒絕公開 API 請求（403），請稍後重試或手動匯入 PGN。')
        response.raise_for_status()
        if len(response.content) > 10_000_000:
            raise ValueError('平台回傳資料過大，請改用分批 PGN 匯入。')
        return response
    try:
        if source == 'chesscom':
            username = username.lower()
            base = f'https://api.chess.com/pub/player/{username}/games'
            archives = get(base+'/archives').json().get('archives', [])
            entries = []
            for url in archives[-3:]:
                # Only canonical official monthly archives, never arbitrary remote URLs.
                if not re.fullmatch(re.escape(base)+r'/\d{4}/\d{2}', url):
                    raise ValueError('平台回傳非預期的棋譜網址。')
                entries.extend(get(url).json().get('games', []))
            valid = [g for g in entries if g.get('rules') == 'chess' and g.get('end_time') and g.get('pgn')]
            valid.sort(key=lambda g:g['end_time'], reverse=True)
            return '\n\n'.join(g['pgn'] for g in valid[:200])
        if source == 'lichess':
            return get(f'https://lichess.org/api/games/user/{username}?max=100&ongoing=false&finished=true&evals=false&clocks=false', 'application/x-chess-pgn').text
        raise ValueError('不支援的平台。')
    except httpx.HTTPError as e:
        raise ValueError('同步網路失敗，既有棋局不受影響。'+str(e)) from e
    finally:
        if own:client.close()
