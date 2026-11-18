import { Category } from "./weaknesses";
export const lichessResources: Record<
  Category,
  { label: string; url: string; how: string }
> = {
  mate: {
    label: "一步將死",
    url: "https://lichess.org/training/mateIn1",
    how: "先熟悉將死圖形，再回到原局面檢查對手的將軍。此題庫練習找將死，不等於防守課程。",
  },
  undefended: {
    label: "未保護棋子",
    url: "https://lichess.org/training/hangingPiece",
    how: "每題先找未受保護或保護不足的棋子，再決定是否能安全吃子。",
  },
  stalemate: {
    label: "基礎將死與殘局教學",
    url: "https://lichess.org/practice",
    how: "選 Piece Checkmates I，先練基本將死；練習時確認對手是否還有合法走法。",
  },
  opening: {
    label: "依開局分類的戰術題",
    url: "https://lichess.org/training/openings",
    how: "用報告保留的英文開局名稱搜尋；這是開局相關戰術題，不是完整開局理論課。",
  },
  middlegame: {
    label: "中局戰術",
    url: "https://lichess.org/training/middlegame",
    how: "階段分類未證明具體戰術弱點。先做中局題，逐題檢查將軍、吃子與威脅。",
  },
  endgame: {
    label: "殘局戰術",
    url: "https://lichess.org/training/endgame",
    how: "先選殘局題；若規則與基本贏法不熟，改到 Practice 的兵殘局／車殘局教學。",
  },
};
