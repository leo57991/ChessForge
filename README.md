# ChessForge ♞

免費、繁體中文、以真實 Stockfish 分析已結束棋局的個人復盤工具。

## 兩種使用方式

**GitHub Pages**：https://leo57991.github.io/ChessForge/

直接在 Windows / Android 瀏覽器開啟 → 自動同步 Chess.com（或匯入 PGN）→「產生我的報告」→ 選弱點項目直接復盤。使用單執行緒 Stockfish 17.1 Lite WASM，不需要伺服器、密碼或付費 AI。首次使用須下載約 7 MB 引擎。棋譜與結果存在該瀏覽器的 IndexedDB；不同裝置不共用，清除網站資料會刪除紀錄。關閉頁面會停止分析，重開後可重試。Pages 不能執行 Python，因此其儲存與引擎實作不同於本機版，但共用復盤介面與分類門檻。

**Windows 本機完整版**：Python + FastAPI + SQLAlchemy + SQLite + python-chess + Stockfish 19；React + TypeScript + Vite + react-chessboard。

1. 安裝 Python 3.11+、Node.js 22 LTS（包含 npm）。
2. 下載／clone 專案，解壓縮。
3. 可將自己的 PGN 放入 `data/`（GitHub 不含私人棋譜）。
4. 雙擊 `install-windows.bat`，安裝依賴、建置前端、下載 Windows x64 Stockfish，匯入 `data/*.pgn`。
5. 雙擊 `start-windows.bat`，開啟 http://127.0.0.1:8000 。

Windows ARM 使用者需自行從 Stockfish 官方下載相容引擎至 `engine/stockfish.exe`，再執行安裝；安裝器預設下載 x64 universal。

### Android 連到 Windows

同一個可信任的私人 Wi-Fi 下，啟動 `start-lan.bat`。以 `ipconfig` 查詢 Windows IPv4，在手機開啟 `http://該IP:8000`，點「LAN 存取碼」輸入終端機顯示的隨機存取碼。只對私人網路允許 Windows 防火牆 TCP 8000。LAN HTTP 不加密，只適合可信任網路；不要做路由器埠轉送，也不要公開後端。預設啟動仍只綁定 127.0.0.1。

### macOS / Linux 手動啟動

```sh
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cd frontend
npm ci
npm run build
cd ..
# 將官方引擎放到 engine/stockfish 並 chmod +x，或設定 STOCKFISH_PATH
.venv/bin/python backend/seed.py
.venv/bin/python run.py
```

開發時先用 `run.py` 啟動後端，再到 frontend 執行 `npm run dev`。生產模式 UI 與 API 同源，不開放跨來源 API。

## 復盤操作

- 匯入單盤／多盤 PGN，或拖放檔案；解析合法性、拒絕結果 `*`，重複棋局略過。
- 選棋局，快速分析（深度上限 12、每局面 0.15 秒）或深入分析（深度上限 18、每局面 1 秒）。時間與深度任一先達到即停止，所以實際深度可能低於上限。MultiPV=3；少於三個合法走法時候選更少。
- 點棋步：橘色實際走法，綠色最佳走法。綠色箭頭描述**走棋前**的建議，點「回到失誤前」可在相符局面查看。
- 白方評估正數代表白方優勢，負數代表黑方優勢。將死另列，不當作兵值相減。
- 「播放最佳變化」逐步展示，亦可點選變化走法；「回到原始棋局」恢復。
- 拖曳棋子可自由研究合法走法，升變可選后／車／象／馬。試走後引擎會即時重算、更新棋盤評級與教練解說，並提供可顯示在棋盤上的最佳走法。
- 摘要針對 Hugemudraven / oo09080983 的棋步；圖表與完整棋譜包含雙方。
- 取消分析保留已完成步數；重新分析建立新紀錄，不覆寫舊紀錄。SQLite 保留全部歷史分析，介面預設最新一輪。

## 評估與分類

引擎原始 score 先轉為固定白方視角。CP 差值再乘走棋方符號，負損失截為 0。涉及 mate 時 `score_loss=null`，另保存 `mate`、勝方與勝算差。所有候選與實際續著皆為真正引擎回傳。

分類採自訂 logistic 指標 `P(white)=1/(1+exp(-cp/250))`，將死分數映射勝方為 1、負方為 0。轉走棋方後，勝算損失百分點：<1 Excellent、<3 Good、<8 Inaccuracy、<18 Mistake、其餘 Blunder；與最佳 UCI 相同標 Best。此值不是個人實際勝率，也不等同 Chess.com 官方標籤。有限搜尋深度會有波動。

具體原因僅在可驗證時提供：一步將死、優勢變逼和、最佳走法直接吃子。其餘顯示「需進一步檢查」。雙攻、交換優劣、王安全等完整因果偵測尚未完成；不使用 LLM 編造理由。

SQLite 快取含引擎版本、起始 FEN、完整走棋歷史、深度、時間與 MultiPV，避免忽略重複局面和棋權利。Pages 目前不做引擎局面快取。

## 測試

```sh
# Windows
.venv\Scripts\python -m pytest backend/tests -q
# macOS / Linux
.venv/bin/python -m pytest backend/tests -q
cd frontend
npm test
npm run build
npm run build:pages -- --base=/ChessForge/
```

測試使用獨立暫存 SQLite，真實引擎測試需要 STOCKFISH_PATH 或 engine/stockfish。正式資料庫位於 `backend/chessforge.db`；備份前請關閉程式。

## 常見問題

- 找不到 Stockfish：檢查 `engine/stockfish.exe`，或設定 `STOCKFISH_PATH` 完整路徑。
- Windows 安裝器失敗：確認 `py -3`、`npm.cmd` 可執行；初次安裝需要網路。
- 手機無法連線：確認 LAN 模式、相同 Wi-Fi、私人網路防火牆及存取碼。
- 引擎失敗／重啟中斷：錯誤留在分析紀錄，按重新分析；既有棋譜不刪除。
- PGN 非法：整批拒絕，不寫入半份資料。零步和棋可保存，但不送引擎分析。
- Pages 載入失敗：確認 WebAssembly 可用，待引擎下載完成再重試；不要使用禁用網站儲存的模式。
- 沒有棋譜：GitHub 不含你的私人 PGN，請上傳原始檔案。

## 目前範圍

Phase 1 已實作，並加入 Pages、PV 播放、評估圖、LAN 啟動、SQLite 快取、Chess.com / Lichess 公開 API 同步與弱點復盤首頁。更完整的雙攻、交換、王安全原因辨識仍是後續項目。

資料來源：只接受已結束 PGN。匯入結果標記不能證明手動檔案確實來自已結束對局；使用者應只匯入已結束的對局。不得用於正在進行的真人棋局。

引擎介接參考：https://python-chess.readthedocs.io/en/stable/engine.html

授權 GPL-3.0-or-later；第三方來源見 THIRD_PARTY.md。

## 自動同步與弱點復盤

- 預設帳號：Chess.com `Hugemudraven`、Lichess `oo09080983`。不需要密碼。
- 開啟頁面時預設自動同步 Chess.com；最多每 30 分鐘觸發一次，可取消勾選。手動同步不受此間隔限制。頁面關閉後不會繼續同步。
- Chess.com 串行下載最近 3 個有棋局的月份，最多匯入最近 200 盤已完成的標準棋局；Lichess 手動同步最近 100 盤，明確排除 ongoing games。
- 官方 API 有快取，剛結束的棋局可能需要等待平台更新。403、404、429、逾時或跨來源限制都會顯示錯誤，不刪除舊資料。
- 首頁「產生我的報告」會先挑未完成分析的中速棋，再按日期排序。序列執行快速分析、顯示逐盤進度，可停止。請保持頁面開啟。
- 弱點只統計兩個帳號自己的走法，採每盤最新**已完成**分析，避免部分分析誤導統計。
- 六個項目：漏看一步將死、未保護棋子、優勢變逼和、開局決策、中局決策、殘局決策。前三類有合法局面或引擎首選應手的直接證據；後三類只是階段分組，不聲稱已找到戰術原因。
- 開局：前 20 半步；殘局：非兵非王棋子最多 4 枚，或無后且最多 6 枚；其餘中局。先判殘局再判開局。這是透明的產品分組規則，不是通用棋理定義。
- 按估計勝算損失排列，每盤最多推薦 2 個局面，一次最多 6 個；顯示樣本數，避免將單盤結果當成長期能力。
- 點局面卡直接跳到相應棋步及其已完成分析，可比較實際／最佳走法、播放變化、回到失誤前。

ChessForge 與 Chess.com 無隸屬、合作或官方背書關係。API 文件：https://support.chess.com/en/articles/9650547-what-is-the-pubapi-and-how-do-i-use-it

## 個人報告與 Lichess 練習指引

ChessForge 專注真實對局報告與互動復盤，首頁已移除內建每日訓練、作答與排程區。舊訓練資料保留以避免資料損失；歷史設計文件不代表目前介面。

1. 同步 Chess.com／Lichess 或匯入 PGN。
2. 更新棋局後，新匯入的對局會自動分析，報告隨分析完成而更新。已完成的分析會直接重用。首頁預設全部已匯入對局，按「產生我的報告／更新我的報告」。不需要選群組；可在「調整範圍」選最近 20／40／100 盤或個別來源時制。依序分析缺少結果的棋局；保持頁面開啟，可停止後繼續。
3. 先看最多三個白話改善重點，按「查看這一步」進入實戰。需要數據時再展開「查看完整圖表與開局表現」，查看實戰比例、白黑方第 15 回合平均評估與具名開局戰績。點局面返回棋盤，查看 Explain、Best Move 及最佳變化。
4. 按弱點下方的 Lichess 連結前往對應主題。沒有傳送棋譜或同步 Lichess 練習進度。報告可下載 Markdown。

比例依可見定義計算，非 Aimchess 官方分數，沒有虛構同級玩家排名。不同指標分母不同；缺資料留空，將死不當作兵值平均。時間管理尚未評分。快篩結果仍應用深入分析確認重大決策。

### 裝置驗收方式

Android：Chrome 開啟 Pages，完成同步→生成報告→點局面復盤→前往 Lichess→重新整理，確認分析仍在；測試升變選單及直向棋盤。Windows：依前述步驟執行 `install-windows.bat`、`start-windows.bat`，用同樣流程確認 SQLite 保存。若手機要共用電腦資料，執行 `start-lan.bat`，在同一區網輸入終端顯示的網址與存取碼。避免把 LAN 服務轉發到公開網路。

目前已做 macOS 主機、真實引擎與瀏覽器驗證；不冒稱已測試 Android／Windows 實機。尚未加入完整 PWA 離線啟動、外部題庫、長篇課程、殘局模擬對手或自動雲端同步。

### 開局名稱與學習方法

報告的開局名稱使用本機內建的 Lichess CC0 開局資料（3,865 筆），比對前 8 回合最後符合的局面，顯示常見中文體系名稱、完整英文變化名與 ECO 編號。不同落子順序可轉入同一局面；自訂起始 FEN 不推測名稱。少見開局未翻譯時保留英文，後續偏離理論不會宣稱整盤仍是標準變化。

先查看常見開局的名稱、戰績與中央計畫，再回看自己的問題局面。Lichess 開局題目用於練習相關戰術，並非完整開局課程；開局資料庫不是最佳走法保證。

### 精簡復盤與個人分析報告

- 棋盤落點以 ⭐／👍／✅／🤔／😕／❌ 表示本手評級。預設不顯示多條箭頭或合法落點提示。
- 點 **Explain · 解釋** 看可驗證原因與實際應手；點 **Best Move · 最佳走法** 看一條建議箭頭，逐步播放，隨時「回到實戰」。完整棋譜與引擎候選放在可展開區塊。
- 首頁展開 **我的個人分析報告**，選平台／時間控制／白黑與樣本數，查看開局銜接、失誤控制、優勢兌現、劣勢挽救、殘局、常見開局、前後期比較；可點棋步復盤或匯出 Markdown。只計完整分析且屬於設定帳號的實戰。尚未分析的棋局先按分析；小樣本不是完整能力診斷。
- 新增 **速覽**（深度上限 8、每局面 0.05 秒、單候選），適合初篩；重大決策仍用深入分析確認。
- 相鄰局面共用搜尋結果；N 個半步的評估呼叫由 2N 降至 N+1。時間／深度均為上限，實際速度視裝置而定。
- [研究、報告定義、加速取捨](docs/REVIEW-REPORT-RESEARCH.md)。
