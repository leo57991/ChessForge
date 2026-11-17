import { Chess } from "chess.js";
import entries from "./openings-data.json";
import type { Move } from "./types";

export type Opening = {
  name: string;
  english: string;
  eco: string;
  line: string;
  matchedPly: number;
  custom: boolean;
};
type Guide = {
  zh: string;
  idea: string;
  white: string;
  black: string;
  check: string;
};
const guides: Record<string, Guide> = {
  "Queen's Gambit Accepted": {
    zh: "接受后翼棄兵",
    idea: "白方以 c 兵交換中央空間，黑方接受兵後需要及時發展。",
    white: "先發展馬與象，再判斷如何收回 c4 兵；不要只為吃回一兵連走同一棋子。",
    black: "不要為保住 c4 多出的一兵耗費太多步；發展棋子並準備反擊中央。",
    check: "比較吃回 c4 與先發展棋子的差別，查看對方能否用 …e5 或 …c5 反擊。",
  },
  "Queen's Gambit Declined": {
    zh: "拒絕后翼棄兵",
    idea: "黑方以 …e6 支援 d5，建立穩固中央，但要解決 c8 象的發展。",
    white: "發展棋子、保護中央，理解 cxd5 交換如何改變兵形。",
    black: "先完成王翼發展與王車易位，再找 …c5 或 …e5 的時機。",
    check: "每次中央交換後，確認哪一方棋子更容易出動。",
  },
  "Queen's Gambit": {
    zh: "后翼棄兵",
    idea: "白方用 c4 挑戰黑方 d5 兵，爭取中央空間。",
    white: "理解黑方接受或拒絕棄兵後的差異，再完成輕子發展。",
    black: "先決定如何維持或交換 d5 中央兵，不要只顧多吃兵。",
    check: "先看 d5 與 c4 的交換，再檢查雙方發展速度。",
  },
  "Slav Defense": {
    zh: "斯拉夫防禦",
    idea: "黑方用 …c6 支援 d5，保留白格象的發展空間。",
    white: "發展雙馬、施壓中央，吃 c4 前先確認局面。",
    black: "思考 c8 象何時出動，以及是否需要 …e6。",
    check: "檢查象出動後 b7 或中央是否留下弱點。",
  },
  "Italian Game": {
    zh: "義大利開局",
    idea: "白方 Bc4 指向 f7，雙方爭取快速發展與中央控制。",
    white: "先完成發展與易位，再準備 c3、d4 等中央計畫；不要過早只盯 f7。",
    black: "發展輕子、保護 e5 與 f7，適時反擊中央。",
    check: "攻擊 f7 前，先數攻守棋子並檢查自己的王安全。",
  },
  "Ruy Lopez": {
    zh: "西班牙開局",
    idea: "白方 Bb5 對 c6 馬施壓，間接影響 e5 中央兵。",
    white: "先保護 e4、完成易位，再決定象退路與中央擴張。",
    black: "守好 e5，讓棋子協調，不要以為象換馬後 e5 一定會丟。",
    check: "交換 c6 前後都計算中央兵能否真正被吃。",
  },
  "Scotch Game": {
    zh: "蘇格蘭開局",
    idea: "白方早走 d4 打開中央，發展速度與戰術都很重要。",
    white: "中央打開後迅速發展，避免后與馬被反覆追趕。",
    black: "積極出子，觀察中央交換後的先手攻擊。",
    check: "每次吃回中央棋子前，檢查將軍、牽制與對方帶先手的攻擊。",
  },
  "Sicilian Defense": {
    zh: "西西里防禦",
    idea: "黑方用 …c5 從側翼挑戰中央，通常形成不對稱兵形。",
    white: "完成發展，先理解 d4 交換後的中央與開放線，不急著背長變化。",
    black: "注意 d5 格與王安全，完成發展後再運用半開放 c 線。",
    check: "判斷中央是否已打開，再決定側翼推兵會不會讓王受攻。",
  },
  "French Defense": {
    zh: "法蘭西防禦",
    idea: "…e6 與 …d5 挑戰白方中央，黑方常要處理 c8 象的空間。",
    white: "保護中央兵鏈，觀察黑方對 d4 的壓力。",
    black: "用 …c5 等兵突破攻擊兵鏈底部，同時安排白格象出路。",
    check: "先找兵鏈底部及突破點，再決定交換或推進。",
  },
  "Caro-Kann Defense": {
    zh: "卡羅康防禦",
    idea: "黑方以 …c6 準備 …d5，爭取穩固兵形。",
    white: "選擇推進或交換中央兵後，優先出子與易位。",
    black: "注意白格象的出動時機，不讓穩固兵形變成發展落後。",
    check: "確認中央交換後哪些棋子可以帶先手出動。",
  },
  "Scandinavian Defense": {
    zh: "斯堪地那維亞防禦",
    idea: "黑方第一步 …d5 直接挑戰 e4，常需處理后較早出動的代價。",
    white: "發展棋子時利用攻擊黑后的先手，不要為追后破壞協調。",
    black: "讓后走到安全格後迅速發展，避免反覆移后。",
    check: "數一數追后是否真的幫助你發展，而不是只多走一步。",
  },
  "Pirc Defense": {
    zh: "皮爾茨防禦",
    idea: "黑方先發展、準備王翼象側翼出動，再反擊白方中央。",
    white: "保持中央兵互相支援，避免過度推兵。",
    black: "完成王安全安排，再選 …e5 或 …c5 挑戰中央。",
    check: "檢查中央推進後留下的空格與象的斜線。",
  },
  "Modern Defense": {
    zh: "現代防禦",
    idea: "黑方以 …g6、…Bg7 對中央施加遠距壓力。",
    white: "佔領中央但保持兵形完整，快速發展。",
    black: "不要只讓對手佔滿中央；尋找合適的兵突破。",
    check: "推兵前確認長斜線是否會打開而暴露王。",
  },
  "King's Indian Defense": {
    zh: "王印度防禦",
    idea: "黑方先王翼側翼出象，再挑戰白方廣大的中央。",
    white: "保持中央穩固、完成發展，再利用空間優勢。",
    black: "先易位並協調棋子，再選中央突破計畫。",
    check: "中央封閉或打開會改變兩翼進攻的速度，先判斷中央。",
  },
  "Nimzo-Indian Defense": {
    zh: "尼姆佐印度防禦",
    idea: "黑方 Bb4 牽制 c3 馬，爭取對 e4 格與白方兵形的影響。",
    white: "決定如何解除牽制，衡量雙象與兵形的交換。",
    black: "不要自動交換象；比較交換後兵形與棋子活動。",
    check: "Bxc3 後誰吃回、兵形如何改變？先在棋盤走出來。",
  },
  "Indian Defense": {
    zh: "印度防禦體系",
    idea: "黑方以 …Nf6 回應 d4，後續兵形決定具體體系。",
    white: "穩固中央並發展棋子，觀察黑方後續兵走法。",
    black: "先選擇中央配置，再協調雙象與雙馬。",
    check: "這只是較早的體系名稱，後續可能轉入其他印度防禦。",
  },
  "London System": {
    zh: "倫敦體系",
    idea: "白方常以 d4 與 Bf4 建立發展配置，但仍要回應黑方具體威脅。",
    white: "協調象與馬，注意 b2 與中央；不要機械式按固定順序落子。",
    black: "挑戰 d4 中央，觀察白格象離開後的后翼弱點。",
    check: "每次按熟悉配置出子前，先確認對手上一手的威脅。",
  },
  "English Opening": {
    zh: "英國式開局",
    idea: "白方以 c4 控制 d5，兵形可轉入多種后兵開局。",
    white: "先發展棋子，再判斷是否用 d4 轉入后兵中央。",
    black: "選擇中央配置，注意白方側翼象對中央的影響。",
    check: "記住當前兵形與計畫，比只記第一步名稱更重要。",
  },
  "Zukertort Opening": {
    zh: "楚克爾托特開局",
    idea: "白方以 Nf3 靈活發展，尚未固定中央兵形。",
    white: "觀察黑方配置，再決定 d4、c4 或其他中央計畫。",
    black: "爭取中央空間，正常發展，不急於追趕馬。",
    check: "留意後續是否轉入其他有名稱的開局。",
  },
  "King's Pawn Game": {
    zh: "王兵開局",
    idea: "白方 e4 爭取中央與王翼象的出路，後續才決定具體開局。",
    white: "發展輕子、照顧 e4 並準備易位。",
    black: "挑戰或限制白方中央，讓輕子能自然出動。",
    check: "目前名稱很廣，先學出子、中央與王安全。",
  },
  "Queen's Pawn Game": {
    zh: "后兵開局",
    idea: "白方 d4 佔領中央，兵受到后的支援。",
    white: "協調輕子，再決定是否以 c4 挑戰中央。",
    black: "對中央施壓，避免只被動守住。",
    check: "觀察 c 兵與 e 兵的走法如何改變中央。",
  },
};
const generic: Guide = {
  zh: "",
  idea: "先理解目前的中央兵形、輕子發展與王安全。",
  white: "找出尚未出動的輕子，確認中央兵是否受到攻擊。",
  black: "檢查對方的中央威脅，完成輕子發展與王安全安排。",
  check: "比較你最早一次開局錯步與引擎建議，說出下一步需要防守什麼。",
};
export function openingGuide(english: string) {
  // Longest family prefix avoids labelling Queen’s Gambit Accepted as the generic gambit.
  const family = Object.keys(guides)
    .sort((a, b) => b.length - a.length)
    .find(
      (k) =>
        english === k ||
        english.startsWith(k + ":") ||
        english.startsWith(k + ",") ||
        english.startsWith(k + ", "),
    );
  return family ? guides[family] : generic;
}
const key = (fen: string) => fen.split(" ").slice(0, 4).join(" ");
const index = new Map<string, string[]>();
for (const entry of entries)
  if (!index.has(entry[0])) index.set(entry[0], entry);
const initial = new Chess().fen();
export function identifyOpening(
  moves: Pick<Move, "ply" | "fen_before" | "fen_after">[],
): Opening {
  const ordered = [...moves].sort((a, b) => a.ply - b.ply);
  const custom = !!ordered.length && ordered[0].fen_before !== initial;
  let match: string[] | undefined,
    matchedPly = 0;
  if (!custom)
    for (const move of ordered.filter((m) => m.ply <= 16)) {
      const found = index.get(key(move.fen_after));
      if (found) {
        match = found;
        matchedPly = move.ply;
      }
    }
  if (!match)
    return {
      name: custom ? "自訂起始局面" : "尚未辨識到標準開局",
      english: "",
      eco: "",
      line: "",
      matchedPly: 0,
      custom,
    };
  return {
    name: openingGuide(match[2]).zh || match[2],
    english: match[2],
    eco: match[1],
    line: match[3],
    matchedPly,
    custom: false,
  };
}
