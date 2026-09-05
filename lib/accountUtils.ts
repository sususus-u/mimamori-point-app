import type { AccountDoc } from "@/types/firestore";

export function getYenValue(
  acc: Pick<AccountDoc, "isYenBased" | "currentBalance" | "yenExchangeRate">
): number | null {
  if (acc.currentBalance == null) return null;
  if (acc.isYenBased) {
    const rate = acc.yenExchangeRate ?? 1;
    return acc.currentBalance * rate;
  }
  if (acc.yenExchangeRate != null) {
    return acc.currentBalance * acc.yenExchangeRate;
  }
  return null;
}
