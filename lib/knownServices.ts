// スクショ読み取り結果(サービス名・単位)から、種類・円建てフラグを推測するための対応表。
// 部分一致で判定し、未知のサービスは単位表記からのフォールバック推測に回す。

import type { AccountCategory } from "@/types/firestore";

export interface KnownServiceInfo {
  category: AccountCategory;
  isYenBased: boolean;
}

export const KNOWN_SERVICES: Record<string, KnownServiceInfo> = {
  PayPay残高: { category: "electronic_money", isYenBased: true },
  PayPayポイント: { category: "points", isYenBased: true },
  "au PAY残高": { category: "electronic_money", isYenBased: true },
  "au PAYポイント": { category: "points", isYenBased: true },
  "LINE Pay残高": { category: "electronic_money", isYenBased: true },
  楽天ポイント: { category: "points", isYenBased: true },
  dポイント: { category: "points", isYenBased: true },
  Pontaポイント: { category: "points", isYenBased: true },
  Vポイント: { category: "points", isYenBased: true },
  WAON: { category: "electronic_money", isYenBased: true },
  nanaco: { category: "electronic_money", isYenBased: true },
  Suica: { category: "electronic_money", isYenBased: true },
  PASMO: { category: "electronic_money", isYenBased: true },
  ANAマイレージクラブ: { category: "miles", isYenBased: false },
  ANAマイル: { category: "miles", isYenBased: false },
  JALマイレージバンク: { category: "miles", isYenBased: false },
  JALマイル: { category: "miles", isYenBased: false },
  Amazonギフト券: { category: "gift_certificate", isYenBased: true },
  図書カード: { category: "gift_certificate", isYenBased: true },
};

export function guessServiceInfo(serviceName: string, unit: string | null): KnownServiceInfo {
  for (const [key, info] of Object.entries(KNOWN_SERVICES)) {
    if (serviceName.includes(key) || key.includes(serviceName)) {
      return info;
    }
  }
  if (unit === "円") return { category: "electronic_money", isYenBased: true };
  if (unit === "マイル") return { category: "miles", isYenBased: false };
  if (unit === "pt" || unit === "ポイント") return { category: "points", isYenBased: true };
  return { category: "other", isYenBased: true };
}
