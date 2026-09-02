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
  "PayPayポイント(期間限定)": { category: "points", isYenBased: true },
  "d払い残高": { category: "electronic_money", isYenBased: true },
  "au PAY残高": { category: "electronic_money", isYenBased: true },
  "au PAYポイント": { category: "points", isYenBased: true },
  "LINE Pay残高": { category: "electronic_money", isYenBased: true },
  "楽天ペイ残高": { category: "electronic_money", isYenBased: true },
  楽天ポイント: { category: "points", isYenBased: true },
  "楽天ポイント(期間限定)": { category: "points", isYenBased: true },
  dポイント: { category: "points", isYenBased: true },
  "dポイント(期間限定)": { category: "points", isYenBased: true },
  Pontaポイント: { category: "points", isYenBased: true },
  "Pontaポイント(期間限定)": { category: "points", isYenBased: true },
  Vポイント: { category: "points", isYenBased: true },
  "Vポイント(期間限定)": { category: "points", isYenBased: true },
  "VポイントPay残高": { category: "electronic_money", isYenBased: true },
  WAON: { category: "electronic_money", isYenBased: true },
  "WAON残高": { category: "electronic_money", isYenBased: true },
  "WAON POINT": { category: "points", isYenBased: true },
  nanaco: { category: "electronic_money", isYenBased: true },
  "nanaco残高": { category: "electronic_money", isYenBased: true },
  "nanacoポイント": { category: "points", isYenBased: true },
  Suica: { category: "electronic_money", isYenBased: true },
  PASMO: { category: "electronic_money", isYenBased: true },
  ANAマイレージクラブ: { category: "miles", isYenBased: false },
  ANAマイル: { category: "miles", isYenBased: false },
  "ANA Pay残高": { category: "electronic_money", isYenBased: true },
  JALマイレージバンク: { category: "miles", isYenBased: false },
  JALマイル: { category: "miles", isYenBased: false },
  "JAL Pay残高": { category: "electronic_money", isYenBased: true },
  Amazonギフト券: { category: "gift_certificate", isYenBased: true },
  アマゾンギフト券: { category: "gift_certificate", isYenBased: true },
  切手: { category: "gift_certificate", isYenBased: true },
  図書カード: { category: "gift_certificate", isYenBased: true },
};

export function guessServiceInfo(serviceName: string, unit: string | null): KnownServiceInfo {
  // "WAON" と "WAON POINT" のように、一方がもう一方の部分文字列になっているキーが
  // 存在するため、まず完全一致を優先して判定する(部分一致だけだと登録順で誤判定しうる)
  if (serviceName in KNOWN_SERVICES) {
    return KNOWN_SERVICES[serviceName];
  }
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
