# 驗證紀錄

環境：macOS Apple Silicon；Python 3.9.6；Node 26.3.0。Windows 安裝建議 Python 3.11+、Node 22 LTS。

## 實際資料

- 使用使用者提供的兩份 PGN，並未公開到 GitHub。
- Chess.com：220 盤；Lichess：28 盤。合計 248 盤、15,512 個半步。
- Python 解析器完整驗證每一步是否合法，全部匯入 SQLite。
- 再次匯入：新增 0 盤，重複 248 盤。
- Chess.com 檔案含 1 盤零步協議和棋：保留棋局，但禁止空棋局分析。
- 前端 chess.js 解析器亦通過同一批 248 盤測試。此私人資料測試在 GitHub CI 會略過，因原始 PGN 不上傳。

## 真實引擎

- Native Stockfish 19：Hugemudraven vs RITIK_D_ROGER（2026.11.15，中速 600 秒），深入模式深度上限 18、每局面 1 秒、MultiPV 3。
- 30 / 30 半步完成；30 / 30 均保存最佳變化；整盤雙方棋步合計 1 次 Blunder、1 次 Mistake。
- 深度為上限，實際搜尋深度另存，並非保證每一步到 18。
- 發布使用的 Stockfish 17.1 Lite WASM 以 Node UCI 實際執行：初始局面回傳 3 個合法候選 e4 / d4 / g3（此為當次搜尋結果，不是硬編碼）。

## 自動化檢查

- pytest：11 項通過，涵蓋匯入、去重、原子性拒絕非法 PGN、王車易位、吃過路兵、升變、將死、逼和、分數視角、真實引擎、快取、取消紀錄保留及 API 存取碼／Origin 檢查。
- Vitest：核心 7 項曾於本機通過（包含 248 盤私人資料）；真實 WASM + 前端 UCI 解析器整合測試已於 GitHub CI 通過。本機後續一次測試因 Vitest 子程序啟動逾時未能執行，不列為通過。
- TypeScript 與 Vite 本機、Pages 模式建置通過。
- GitHub Actions Pages 首次建置與部署成功，正式首頁 HTTP 200。

## 尚未完成的驗證

- 瀏覽器已確認首頁及 Pages 模式可渲染。檔案選擇器的自動化操作逾時，之後瀏覽器控制連線未恢復，因此未完成完整點擊分析、PV 播放、自由研究的端對端 UI 驗證。
- WASM 在 Node 執行及解析器測試不等同 Android 瀏覽器的 Worker 載入測試。
- Windows 原生啟動、Android 實機及跨裝置 LAN 存取尚未實測；已提供啟動腳本、響應式介面及存取碼保護。
- 已補上 Chess.com / Lichess 同步與弱點首頁。

## 公開 API 實測

- Chess.com Hugemudraven：下載 200 盤，新增 6 盤、略過 194 盤；再次匯入新增 0、重複 200。
- Lichess oo09080983：下載 28 盤，全部辨識為既有資料；再次匯入新增 0。
- 本機資料庫因此由 248 盤增加為 254 盤。
- 使用官方公開 API、具識別資訊的 User-Agent，未提供密碼，未使用進行中的棋局端點。
- 新增同步錯誤／標準棋篩選與弱點證據／己方篩選測試。
