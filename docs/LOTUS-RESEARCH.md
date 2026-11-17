# Lotus Chess 研究與 ChessForge 的取捨
研究日期：2026-11-17。範圍：官方網站、兩商店產品／更新／評論、展示影片索引、兩個 Reddit 討論、學習科學原始研究。未登入付費課程，未取得其程式碼；不複製圖像、課程或介面資產。

## 已有公開依據
- [官方網站](https://www.lotus-chess.com/) 把「從對局找弱點、按常見應手學路線、重複練到熟悉、查看開局戰績」串成開局學習流程。這是產品方的功能／效果主張，不是獨立成效試驗。
- [App Store](https://apps.apple.com/us/app/lotus-chess-trainer/id6738741464) 當次可讀版本 3.1.6；描述包含個人每日訓練、開局、基礎課、殘局、難度配對題目與分析。3.1.0/3.1.1 說明同時連結兩平台及繁體中文；2.6.0 提到跨裝置帳戶；2.5.x 新增殘局實作。可見產品已由開局工具擴充成多模組學習流程。
- [Google Play](https://play.google.com/store/apps/details?id=com.lotuschess.app&hl=en-US) 顯示依真實對局推薦內容、離線課程與題目。抓取結果有不同快取版本（其中頁面更新日 2026-08-28），因此不宣稱 Android 最新二進位版本已確認，也不將商店人數或評分視為可靠效果證據。
- [Reddit 長篇使用心得與追蹤留言](https://www.reddit.com/r/chess/comments/1kh6s78/app_review_lotus_chess/) 描述：從較短開局序列漸進加深，重訪已學局面，按題型練習再混合，隨時進分析板，按開局看勝負。後續指出想要分支樹、回看前序、較短的掌握度練習。這是個別使用者體驗，並非所有版本皆相同。
- [替代走法討論](https://www.reddit.com/r/chess/comments/1pe289c/something_thats_been_bugging_me_about_the_lotus/) 描述某些路線只接受指定走法；其他評論又提到可改路線。由此不能斷言所有模式都拒絕替代走法，但足以提示設計風險。
- [App Store 評論與開發者回覆](https://apps.apple.com/us/app/lotus-chess-trainer/id6738741464?platform=iphone&see-all=reviews)：有人肯定針對弱點複習，也有人反映突然跳到局面使理解流於背誦、難以找回學過的路線。開發者承認路線總覽仍可改善。評論有選擇偏差，不作量化品質結論。

## 教學／展示查核與限制
搜尋找到 agadmator 的兩個產品展示：[Learn To Fight Like Bobby Fischer](https://www.youtube.com/watch?v=oq5rrHOYn7U)（索引章節：總覽 02:30、King's Gambit 05:00、Q&A 25:15），以及 [2026-09-02 展示](https://www.youtube.com/watch?v=aPAP5-M3L-4)（開局 00:50、Games 02:30、Puzzles 02:47、Endgames 03:20、Foundations 07:50）。索引及介紹有導流連結，視為推廣展示；本環境未能取得可核實的完整播放／逐字稿，不宣稱已完整觀看，也不據此推斷隱藏演算法。未找到可核實的官方排程技術白皮書。

## 設計推論（不是已確認的 Lotus 內部實作）
常見應手優先可能結合局面頻率、歷史失誤與課程樹；反覆測試可能使用間隔重複或掌握度排程；每日份量可能協調多模組。公開資料沒有證明採用 FSRS、SM-2、IRT 或某個 LLM，更沒有公開個人化的精確權重。ChessForge 自行實作可解釋、可測試的規則，不沿用「AI」行銷字樣。

## 學習方法的證據與限制
[Roediger & Karpicke, 2006](https://journals.sagepub.com/doi/10.1111/j.1467-9280.2006.01693.x) 支持先主動回憶、隔一段時間再測比只重讀更有利於延後記憶。[Karpicke & Bauernschmidt, 2011](https://learninglab.psych.purdue.edu/downloads/2011/2011_Karpicke_Bauernschmidt_JEPLMC.pdf) 討論間隔提取，不能據此認定某一擴張排程對所有材料最佳。這些不是西洋棋棋力提升試驗。因此採簡單透明的排程作工程起點，並另追蹤真實新對局是否改善。

## 採用與不採用
採用：自己對局優先、每日短課、到期複習、開局頻率、可回溯路線、隨時復盤、學習與實戰分開看。
改進：允許引擎證實的替代走法；標示證據與樣本數；提示／看答案不算獨立掌握；避免同一天刷題灌分；不強推從未下過的開局。
暫不採用：付費課程、排行榜、連續天數壓力、海量罕見開局記憶或宣稱適合所有 Elo。先把個人資料形成可靠閉環。
