# ChessForge ♞

免費、繁體中文、以真實 Stockfish 分析已結束棋局的個人復盤工具。

## 兩種使用方式

**GitHub Pages**：https://leo57991.github.io/ChessForge/

直接在 Windows / Android 瀏覽器開啟 → 自動同步 Chess.com（或匯入 PGN）→「分析最近 5 盤，幫我挑局面」→ 選弱點項目直接復盤。使用單執行緒 Stockfish 17.1 Lite WASM，不需要伺服器、密碼或付費 AI。首次使用須下載約 7 MB 引擎。棋譜與結果存在該瀏覽器的 IndexedDB；不同裝置不共用，清除網站資料會刪除紀錄。關閉頁面會停止分析，重開後可重試。Pages 不能執行 Python，因此其儲存與引擎實作不同於本機版，但共用復盤介面與分類門檻。

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
- 拖曳棋子可自由研究合法走法，升變可選后／車／象／馬。自由研究不提供額外引擎查詢。
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
- 首頁「分析最近 5 盤，幫我挑局面」會先挑未完成分析的中速棋，再按日期排序。序列執行快速分析、顯示逐盤進度，可停止。請保持頁面開啟。
- 弱點只統計兩個帳號自己的走法，採每盤最新**已完成**分析，避免部分分析誤導統計。
- 六個項目：漏看一步將死、未保護棋子、優勢變逼和、開局決策、中局決策、殘局決策。前三類有合法局面或引擎首選應手的直接證據；後三類只是階段分組，不聲稱已找到戰術原因。
- 開局：前 20 半步；殘局：非兵非王棋子最多 4 枚，或無后且最多 6 枚；其餘中局。先判殘局再判開局。這是透明的產品分組規則，不是通用棋理定義。
- 按估計勝算損失排列，每盤最多推薦 2 個局面，一次最多 6 個；顯示樣本數，避免將單盤結果當成長期能力。
- 點局面卡直接跳到相應棋步及其已完成分析，可比較實際／最佳走法、播放變化、回到失誤前。

ChessForge 與 Chess.com 無隸屬、合作或官方背書關係。API 文件：https://support.chess.com/en/articles/9650547-what-is-the-pubapi-and-how-do-i-use-it

## 個人訓練中心（長期訓練升級）

1. 開啟首頁，讓 Chess.com 自動同步；Lichess 可按同步。按「分析最近 5 盤」或挑選單盤分析。
2. 「每日訓練」按「安排並開始今日訓練」。先自行走棋，可點起點／終點、拖曳，或輸入 SAN／UCI。每日題目只來自自己的已完成分析。
3. 答題後查看局面證據、最佳變化，寫下一個落子前的檢查重點。可以回看如何走到這個局面，再進完整復盤。
4. 無提示答對後，複習間隔為 1、3、7、14、30、60 天；錯答、提示／答案隔天重看。提前或同日重練不提升掌握度。三次以上獨立成功且跨七天，才稱為「延後回憶穩定」。此標籤只代表這個局面的記憶證據，不是棋力認證。
5. 「我的開局」用自己的實戰前四半步分組，保留白黑方、出現頻率、戰績與前序走法；可練習個別決策、暫停安排、選擇已驗證候選中的偏好走法。目前自動課程取前八回合，並非完整開局百科。
6. 「成長紀錄」分開顯示排程作答、實戰每百步失誤及訓練後同局面再犯。樣本不足會明示，平台和時間控制分組比較，不宣稱因果或預測 Elo。
7. 每日預設最多 5 題／3 個新局面、同盤最多兩題；設定可調整到 10／15 題。計畫會保存，重新整理後按「繼續今日訓練」。今天的清單不會在答完後自動塞入更多題。
8. 「備份與設定」下載 JSON。換裝置時先匯入／分析相同棋局，再貼上備份還原。備份包含訓練紀錄、心得、排程與每日清單，不包含 PGN／引擎分析。Pages 的資料按瀏覽器與網址分開保存；目前無自動雲端跨裝置同步。

SQLite 啟動時會以 `create_all` 新增 `training_state` 表，不修改或刪除原棋局。表含 `id`, `revision`, `state`（版本 1 JSON）；同一個 TypeScript 排程核心供 Pages 與原生模式使用。每次寫入檢查 revision，衝突時要求重新載入而不覆蓋他人進度。IndexedDB 使用既有 `state` store 的獨立 `training` key，與棋局保存分離。

額外合法走法會由 Stockfish 重新比較，只能對已匯入且已完成的棋局棋步呼叫 `/api/training/check`，不接受任意 FEN。普通評估距離最佳不超過 30cp 可接受；將死另以勝方與距離判定。搜尋仍有深度／時間限制，不宣稱數學證明。引擎失敗時不記錯答。

研究與可擴充設計：[`docs/LOTUS-RESEARCH.md`](docs/LOTUS-RESEARCH.md)、[`docs/TRAINING-DESIGN.md`](docs/TRAINING-DESIGN.md)。訓練測試在 `frontend/src/training.test.ts`；持久化衝突與真實引擎比較測試在 `backend/tests/test_core.py`。

### 裝置驗收方式

Android：Chrome 開啟 Pages，完成同步→分析→每日答題→重新整理→繼續，確認作答仍在；測試升變選單及直向棋盤。Windows：依前述步驟執行 `install-windows.bat`、`start-windows.bat`，用同樣流程確認 SQLite 保存。若手機要共用電腦資料，執行 `start-lan.bat`，在同一區網輸入終端顯示的網址與存取碼。避免把 LAN 服務轉發到公開網路。

目前已做 macOS 主機、真實引擎與瀏覽器驗證；不冒稱已測試 Android／Windows 實機。尚未加入完整 PWA 離線啟動、外部題庫、長篇課程、殘局模擬對手或自動雲端同步。
