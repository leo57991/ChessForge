# 精簡復盤與個人報告（2026-11-18）

## 研究與採用決策

Chess.com 官方 [Game Review 教學](https://support.chess.com/en/articles/10328363-how-do-i-use-game-review-on-the-app) 與 [箭頭說明](https://support.chess.com/en/articles/17665907-what-do-the-colored-arrows-in-game-review-mean) 顯示單步評級、解釋、最佳走法、重試及可選箭頭的流程。ChessForge 採用漸進揭露：預設只有當前走法的表情標記；按 Explain 看證據，按 Best Move 才顯示一條最佳箭頭，逐步播放一次一手。完整棋譜與候選路線仍可展開。評級規則是自己的定義，未複製官方評分、資產或付費內容。

使用者提供的 [Aimchess 首頁](https://aimchess.com/home) 在本次瀏覽中跳轉登入頁，因此沒有宣稱親自測試其登入後或付費報告。公開使用者評測 [Matt Plays Chess](https://mattplayschess.com/aimchess/) 與 [Terabyte Tiger](https://chess.terabytetiger.com/post/21-12-01-aimchess/) 描述開局、戰術、殘局、優勢兌現、劣勢挽救、時間管理，以及從弱點連回實際棋局的做法。這些較早評測支持產品設計方向，不代表已確認現行版本所有細節。

最有價值的借鑑是「跨棋局發現問題 → 回到有證據的局面 → 練習 → 再看新對局」。本版報告採用真實已完成分析，依平台、時間控制、執棋顏色分組；每個比例都附分母與定義，列出優先改善、可點擊棋步、常見開局，以及最近 10 盤與前 10 盤的每百步錯誤率。小樣本與混合引擎設定明確提示。沒有足夠人口資料，不提供同分段百分位、虛構 Elo 或總能力分數。尚未可靠解析逐步時鐘，時間管理不評分。殘局與開局使用公開的簡化操作定義，不冒充完整棋藝測量。

## 已實作加速

- 相鄰局面重用：上一手走後局面就是下一手走前局面；同一次分析沿用相同搜尋結果，保留完整歷史，搜尋呼叫從 2N 變為 N+1。快／深模式的走後搜尋也用 MultiPV 3，使候選與評估一致。這會與舊版走後 MultiPV 1 得到不同的有限深度結果；不可聲稱數值完全相同或保證兩倍速度。
- 速覽：深度上限 8、每局面最多 0.05 秒、MultiPV 1；適合初篩，關鍵錯步需深入確認。
- 快速：上限 12、0.15 秒、MultiPV 3；深入：上限 18、1 秒、MultiPV 3。時間／深度任一先到即停止，非保證到達深度。
- 原生後端已有持久快取，鍵包含引擎、限制、MultiPV 與完整局面歷史。瀏覽器目前只有同次相鄰局面重用，尚無持久引擎快取。

## 可再做的方法與代價

1. 先快速整盤，再只加深關鍵步：最值得優先做，但本版深入按鈕仍分析整盤。
2. 原生 Stockfish 增加 Threads／Hash：桌機可能更快，但增加 CPU、電量與記憶體；需實測，現行設定沒有自動提高。
3. 瀏覽器持久快取：重複復盤有幫助；必須保留歷史與設定版本並限制儲存容量。
4. 多執行緒 WASM／SIMD：需相容瀏覽器與跨來源隔離；GitHub Pages 不能任意設 COOP/COEP 回應標頭，不能只打開 Threads 就當作完成。
5. 選擇較低 MultiPV：較省搜尋成本但減少候選比較；已用在速覽，快速／深入仍預設 3。

[Stockfish 術語](https://official-stockfish.github.io/docs/stockfish-wiki/Terminology.html)、[FAQ](https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html)、[實用資料](https://official-stockfish.github.io/docs/stockfish-wiki/Useful-data.html)。所有速度都取決於硬體、局面及時間限制；目前沒有宣稱實測倍數。

## 資料與擴充

本次不需要資料庫遷移：報告讀取既有 games/moves/analysis_runs/move_analyses，保留訓練紀錄。開局名稱來自 CC0 Lichess 開局資料的 3,865 筆定義，按合法局面比對，保留 ECO／英文細分與中文家族學習指南；自訂起始局面或未辨識時明示。開局名稱不等於該步是引擎最佳走法。


## 2026-11-18：聚焦報告與復盤

依使用者提供的 Aimchess 截圖，採用「總覽→開局白黑比較→具名開局→實戰問題→改善入口」的資訊順序。獨立定義五項實戰比例，不複製其未公開評分公式或虛構同儕基準。第 15 回合採第 30 半步，所有分數換為使用者視角；將死另計，短局不補值。報告固定在所選來源／時制最新 N 盤內，只採完整分析。

依最新產品方向移除內建訓練區，保留舊資料；新流程由 ChessForge 報告與復盤導向免費 Lichess 主題。來源：[主題目錄](https://lichess.org/training/themes)、[開局題目](https://lichess.org/training/openings)、[基礎練習](https://lichess.org/practice)。階段分類不冒稱已證實某種戰術弱點；開局題庫不冒稱完整開局課程。未同步外部練習進度。
