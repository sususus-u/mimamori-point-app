"use client";

// 口座一覧。AppShellの中に表示される想定(独自のヘッダーは持たない)。
// 「期間限定」タブ(キーはwithExpiryのまま)は、期限日が入っているものに加えて
// 名前に「期間」を含むもの(「期間限定」「期間・利用先限定」等、期限日未入力でも対象)を集める。期限月ごとにグルーピングし、
// 期限未入力のものは「期限未設定」セクションにまとめて最上部に表示、直近3ヶ月は展開・それ以降は折りたたむ。
// 「期限なし」タブはどちらにも当てはまらないものを別扱い。「サービス別」タブはグループ名でまとめる。
// 登録・スクショの導線は /accounts/new 側の大きなCTAに集約したため、ここでは持たない。
// クイック更新のみ、控えめなリンクとして残す。

import { useEffect, useState } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { collection, query, where, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthProvider";
import { CATEGORY_DEFAULTS, type AccountCategory, type AccountDoc } from "@/types/firestore";
import { getYenValue } from "@/lib/accountUtils";

interface AccountWithId extends AccountDoc {
  id: string;
}

function formatBalance(balance?: number | null, unit?: string | null) {
  if (balance === undefined || balance === null) return "";
  if (unit === "円") {
    return (
      <>
        {balance.toLocaleString()}
        <span style={{ fontSize: 11 }}>円</span>
      </>
    );
  }
  return `${balance.toLocaleString()}${unit ?? ""}`;
}

function balanceDisplay(acc: AccountWithId) {
  if (
    acc.faceValue !== undefined &&
    acc.faceValue !== null &&
    acc.itemQuantity !== undefined &&
    acc.itemQuantity !== null
  ) {
    return (
      <>
        {acc.faceValue.toLocaleString()}円 × {acc.itemQuantity}枚 = {formatBalance(acc.currentBalance, acc.balanceUnit)}
      </>
    );
  }
  if (acc.category === "points") {
    const yenValue = getYenValue(acc);
    if (yenValue !== null) {
      const isEquivalentRate = acc.yenExchangeRate == null || acc.yenExchangeRate === 1;
      if (isEquivalentRate) {
        return (
          <>
            {yenValue.toLocaleString()}
            <span style={{ fontSize: 11 }}>円相当</span>
          </>
        );
      }
      return (
        <>
          {formatBalance(acc.currentBalance, acc.balanceUnit)}({yenValue.toLocaleString()}
          <span style={{ fontSize: 11 }}>円相当</span>)
        </>
      );
    }
  }
  return formatBalance(acc.currentBalance, acc.balanceUnit);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function categoryLabel(acc: AccountWithId) {
  if (acc.category === "other") return acc.customCategoryLabel || "その他";
  return CATEGORY_DEFAULTS[acc.category as AccountCategory]?.label ?? acc.category;
}

function isOverdueUnupdated(acc: AccountWithId) {
  if (!acc.expiryDate || acc.type !== "continuous") return false;
  const expiry = (acc.expiryDate as Timestamp).toDate();
  return expiry.getTime() < Date.now();
}

function sortAccounts(list: AccountWithId[], mode: "balance" | "name"): AccountWithId[] {
  if (mode === "name") {
    return [...list].sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }
  // 残高順:円建てのものだけ金額の大きい順に並べ、非円建て(マイル等、比較できない)は末尾に名前順で並べる
  const yenItems = list.filter((a) => getYenValue(a) !== null);
  const others = list.filter((a) => getYenValue(a) === null);
  yenItems.sort((a, b) => (getYenValue(b) ?? 0) - (getYenValue(a) ?? 0));
  others.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  return [...yenItems, ...others];
}

// 「サービス別」タブのグループ内での固定表示順(期間限定/期限なし → ポイント/残高/運用/それ以外)。
// 値が小さいほど先に表示する
function getSortPriority(acc: AccountWithId): number {
  const hasExpiry = Boolean(acc.expiryDate) || acc.name.includes("期間");
  const tier = hasExpiry ? 0 : 1; // 期間限定=0, 期限なし=1

  // 「PayPayポイント(通常)」のように接尾辞が付く名前にも対応するため、末尾一致ではなく含むかで判定する。
  // 「ポイント運用」のような名前を誤って「ポイント」に分類しないよう、「運用」を最優先でチェックする
  let category: number;
  if (acc.name.includes("運用")) category = 2;
  else if (acc.name.includes("残高")) category = 1;
  else if (acc.name.includes("ポイント")) category = 0;
  else category = 3;

  return tier * 10 + category;
}

function sortServiceGroupItems(list: AccountWithId[]): AccountWithId[] {
  return [...list].sort((a, b) => {
    const diff = getSortPriority(a) - getSortPriority(b);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name, "ja");
  });
}

export default function AccountList() {
  const { uid, isLoading } = useAuth();
  const [accounts, setAccounts] = useState<AccountWithId[]>([]);
  const [tab, setTab] = useState<"withExpiry" | "noExpiry" | "byGroup">(() => {
    if (typeof window === "undefined") return "withExpiry";
    const stored = sessionStorage.getItem("account-list-tab");
    if (stored === "withExpiry" || stored === "noExpiry" || stored === "byGroup") return stored;
    return "withExpiry";
  });
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<"balance" | "name">("balance");
  const [withExpirySortMode, setWithExpirySortMode] = useState<"expiry" | "balance" | "name">(
    "expiry"
  );
  // 「サービス別」タブでの、グループ自体の並び順(グループ内アイテムの順序とは独立)
  const [groupSortMode, setGroupSortMode] = useState<"balance" | "name">("balance");

  // タブの選択状態を、画面遷移をまたいで(編集画面から戻ってきた時など)保持する
  useEffect(() => {
    sessionStorage.setItem("account-list-tab", tab);
  }, [tab]);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, "accounts"), where("ownerId", "==", uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: AccountWithId[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as AccountDoc),
      }));
      setAccounts(list);
    });
    return () => unsubscribe();
  }, [uid]);

  const isLimitedOrHasExpiry = (a: AccountWithId) => Boolean(a.expiryDate) || a.name.includes("期間");

  const withExpiry = accounts.filter(isLimitedOrHasExpiry);
  const noExpiry = sortAccounts(
    accounts.filter((a) => !isLimitedOrHasExpiry(a)),
    sortMode
  );

  const isInvested = (a: AccountWithId) => a.name.endsWith("運用");
  const investedAccounts = noExpiry.filter(isInvested);
  const noExpiryExcludingInvested = noExpiry.filter((a) => !isInvested(a));

  const withExpirySummary = {
    count: withExpiry.length,
    yenTotal: withExpiry.reduce((sum, a) => sum + (getYenValue(a) ?? 0), 0),
  };
  const noExpirySummary = {
    count: noExpiryExcludingInvested.length,
    yenTotal: noExpiryExcludingInvested.reduce((sum, a) => sum + (getYenValue(a) ?? 0), 0),
  };
  const investedSummary = {
    count: investedAccounts.length,
    yenTotal: investedAccounts.reduce((sum, a) => sum + (getYenValue(a) ?? 0), 0),
  };

  const withExpiryDated = withExpiry.filter((a) => a.expiryDate);
  const withExpiryUndated = withExpiry.filter((a) => !a.expiryDate);

  const sorted = [...withExpiryDated].sort((a, b) => {
    const da = (a.expiryDate as Timestamp).toDate().getTime();
    const dbTime = (b.expiryDate as Timestamp).toDate().getTime();
    return da - dbTime;
  });

  const groups = new Map<string, AccountWithId[]>();
  for (const acc of sorted) {
    const key = monthKey((acc.expiryDate as Timestamp).toDate());
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(acc);
  }
  const monthKeys = Array.from(groups.keys());

  const serviceGroups = new Map<string, AccountWithId[]>();
  for (const acc of accounts) {
    const key = acc.groupName?.trim() || acc.name;
    if (!serviceGroups.has(key)) serviceGroups.set(key, []);
    serviceGroups.get(key)!.push(acc);
  }
  for (const [key, items] of serviceGroups) {
    serviceGroups.set(key, sortServiceGroupItems(items));
  }
  // グループごとの合計残高(円換算できるものだけの合計)。見出し表示・グループの並び替えにも流用する
  const serviceGroupTotals = new Map<string, number>();
  for (const [key, items] of serviceGroups) {
    const total = items.reduce((sum, acc) => sum + (getYenValue(acc) ?? 0), 0);
    serviceGroupTotals.set(key, total);
  }
  // グループ自体の並び順。「名前順」は単純に五十音順、「残高順」は合計残高の降順
  // (合計が0(円換算できるアカウントがない場合を含む)のグループは、末尾に名前順で並べる)
  const serviceGroupKeys = Array.from(serviceGroups.keys()).sort((a, b) => {
    if (groupSortMode === "name") return a.localeCompare(b, "ja");
    const totalA = serviceGroupTotals.get(a) ?? 0;
    const totalB = serviceGroupTotals.get(b) ?? 0;
    if (totalA > 0 && totalB > 0) return totalB - totalA;
    if (totalA > 0) return -1;
    if (totalB > 0) return 1;
    return a.localeCompare(b, "ja");
  });

  function toggleMonth(key: string) {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (isLoading) {
    return <p style={{ fontSize: 14, color: "#999" }}>読み込み中です...</p>;
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", textAlign: "center" }}>
          <div>
            <p style={{ fontSize: 11, color: "#999", margin: "0 0 4px" }}>期間限定</p>
            <p style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 700, margin: 0 }}>
              ¥{withExpirySummary.yenTotal.toLocaleString()}
            </p>
            <p style={{ fontSize: 11, color: "#999", margin: "2px 0 0" }}>
              {withExpirySummary.count}件
            </p>
          </div>
          <div style={{ borderLeft: "1px solid #eee" }}>
            <p style={{ fontSize: 11, color: "#999", margin: "0 0 4px" }}>期限なし</p>
            <p style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 700, margin: 0 }}>
              ¥{noExpirySummary.yenTotal.toLocaleString()}
            </p>
            <p style={{ fontSize: 11, color: "#999", margin: "2px 0 0" }}>
              {noExpirySummary.count}件
            </p>
          </div>
          <div style={{ borderLeft: "1px solid #eee" }}>
            <p style={{ fontSize: 11, color: "#999", margin: "0 0 4px" }}>運用残高</p>
            <p style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 700, margin: 0 }}>
              ¥{investedSummary.yenTotal.toLocaleString()}
            </p>
            <p style={{ fontSize: 11, color: "#999", margin: "2px 0 0" }}>
              {investedSummary.count}件
            </p>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 16,
          background: "#f2ece7",
          borderRadius: "var(--radius-pill)",
          padding: 4,
        }}
      >
        {[
          { key: "withExpiry", label: "期間限定" },
          { key: "noExpiry", label: "期限なし" },
          { key: "byGroup", label: "サービス別" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as typeof tab)}
            style={{
              flex: 1,
              padding: "8px 10px",
              fontSize: 13,
              background: tab === t.key ? "var(--brand)" : "transparent",
              border: "none",
              borderRadius: "var(--radius-pill)",
              color: tab === t.key ? "#fff" : "#666",
              fontWeight: tab === t.key ? 500 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "withExpiry" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 8 }}>
            {[
              { key: "expiry", label: "期限順" },
              { key: "balance", label: "残高順" },
              { key: "name", label: "名前順" },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setWithExpirySortMode(s.key as typeof withExpirySortMode)}
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: "var(--radius-pill)",
                  border: withExpirySortMode === s.key ? "none" : "1px solid #ddd",
                  background: withExpirySortMode === s.key ? "var(--brand)" : "transparent",
                  color: withExpirySortMode === s.key ? "#fff" : "#888",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          {withExpirySortMode === "expiry" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {monthKeys.length === 0 && withExpiryUndated.length === 0 && (
                <p style={{ fontSize: 14, color: "#999" }}>登録されたサービスがありません</p>
              )}
              {withExpiryUndated.length > 0 && (
                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <p
                    style={{
                      margin: 0,
                      padding: "10px 14px",
                      fontSize: 13,
                      fontWeight: 500,
                      background: "#faf8f6",
                    }}
                  >
                    期限未設定
                  </p>
                  <div>
                    {withExpiryUndated.map((acc) => (
                      <Link
                        key={acc.id}
                        href={`/accounts/${acc.id}/edit`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "12px 14px",
                          fontSize: 14,
                          borderTop: "0.5px solid #f0f0f0",
                          textDecoration: "none",
                          color: "inherit",
                        }}
                      >
                        <div>
                          <p style={{ margin: 0, fontWeight: 500 }}>{acc.name}</p>
                          <p style={{ margin: 0, fontSize: 12, color: "#999" }}>
                            {categoryLabel(acc)}
                          </p>
                        </div>
                        <p style={{ margin: 0 }}>{balanceDisplay(acc)}</p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {monthKeys.map((key, index) => {
                const isRecent = index < 3;
                const expanded = isRecent || expandedMonths.has(key);
                const items = groups.get(key)!;
                return (
                  <div key={key} className="card" style={{ padding: 0, overflow: "hidden" }}>
                    <button
                      onClick={() => toggleMonth(key)}
                      style={{
                        width: "100%",
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        fontSize: 13,
                        fontWeight: 500,
                        background: "#faf8f6",
                        border: "none",
                      }}
                    >
                      <span>{key}</span>
                      <span style={{ color: "#bbb" }}>{expanded ? "－" : "＋"}</span>
                    </button>
                    {expanded && (
                      <div>
                        {items.map((acc) => (
                          <Link
                            key={acc.id}
                            href={`/accounts/${acc.id}/edit`}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              padding: "12px 14px",
                              fontSize: 14,
                              borderTop: "0.5px solid #f0f0f0",
                              textDecoration: "none",
                              color: "inherit",
                              background: isOverdueUnupdated(acc) ? "#fdf3e7" : "transparent",
                            }}
                          >
                            <div>
                              <p style={{ margin: 0, fontWeight: 500 }}>{acc.name}</p>
                              <p style={{ margin: 0, fontSize: 12, color: "#999" }}>
                                {categoryLabel(acc)}
                              </p>
                            </div>
                            <p style={{ margin: 0 }}>{balanceDisplay(acc)}</p>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              {withExpiry.length === 0 && (
                <p style={{ fontSize: 14, color: "#999", padding: 14 }}>登録されたサービスがありません</p>
              )}
              {sortAccounts(withExpiry, withExpirySortMode).map((acc) => {
                const expiry = acc.expiryDate ? (acc.expiryDate as Timestamp).toDate() : null;
                return (
                  <Link
                    key={acc.id}
                    href={`/accounts/${acc.id}/edit`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "12px 14px",
                      fontSize: 14,
                      borderTop: "0.5px solid #f0f0f0",
                      textDecoration: "none",
                      color: "inherit",
                      background: isOverdueUnupdated(acc) ? "#fdf3e7" : "transparent",
                    }}
                  >
                    <div>
                      <p style={{ margin: 0, fontWeight: 500 }}>{acc.name}</p>
                      <p style={{ margin: 0, fontSize: 12, color: "#999" }}>
                        {expiry ? `${expiry.getFullYear()}年${expiry.getMonth() + 1}月期限` : ""}
                      </p>
                    </div>
                    <p style={{ margin: 0 }}>{balanceDisplay(acc)}</p>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "noExpiry" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 8 }}>
            {[
              { key: "balance", label: "残高順" },
              { key: "name", label: "名前順" },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setSortMode(s.key as typeof sortMode)}
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: "var(--radius-pill)",
                  border: sortMode === s.key ? "none" : "1px solid #ddd",
                  background: sortMode === s.key ? "var(--brand)" : "transparent",
                  color: sortMode === s.key ? "#fff" : "#888",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {noExpiry.length === 0 && (
              <p style={{ fontSize: 14, color: "#999", padding: 14 }}>登録されたサービスがありません</p>
            )}
            {noExpiry.map((acc) => (
              <Link
                key={acc.id}
                href={`/accounts/${acc.id}/edit`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  fontSize: 14,
                  borderTop: "0.5px solid #f0f0f0",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div>
                  <p style={{ margin: 0, fontWeight: 500 }}>{acc.name}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "#999" }}>{categoryLabel(acc)}</p>
                </div>
                <p style={{ margin: 0 }}>{balanceDisplay(acc)}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {tab === "byGroup" && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginBottom: 8 }}>
            {[
              { key: "balance", label: "残高順" },
              { key: "name", label: "名前順" },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setGroupSortMode(s.key as typeof groupSortMode)}
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: "var(--radius-pill)",
                  border: groupSortMode === s.key ? "none" : "1px solid #ddd",
                  background: groupSortMode === s.key ? "var(--brand)" : "transparent",
                  color: groupSortMode === s.key ? "#fff" : "#888",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {serviceGroupKeys.length === 0 && (
              <p style={{ fontSize: 14, color: "#999" }}>登録されたサービスがありません</p>
            )}
            {serviceGroupKeys.map((key) => {
              const items = serviceGroups.get(key)!;
              const total = serviceGroupTotals.get(key) ?? 0;
              return (
                <div key={key} className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      fontSize: 13,
                      fontWeight: 500,
                      background: "#faf8f6",
                    }}
                  >
                    <span>{key}</span>
                    {total > 0 && (
                      <span style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 700 }}>
                        ¥{total.toLocaleString()}
                      </span>
                    )}
                  </div>
                  {items.map((acc) => {
                    const expiry = acc.expiryDate ? (acc.expiryDate as Timestamp).toDate() : null;
                    return (
                      <Link
                        key={acc.id}
                        href={`/accounts/${acc.id}/edit`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "12px 14px",
                          fontSize: 14,
                          borderTop: "0.5px solid #f0f0f0",
                          textDecoration: "none",
                          color: "inherit",
                          background: isOverdueUnupdated(acc) ? "#fdf3e7" : "transparent",
                        }}
                      >
                        <div>
                          <p style={{ margin: 0, fontWeight: 500 }}>{acc.name}</p>
                          <p style={{ margin: 0, fontSize: 12, color: "#999" }}>
                            {expiry
                              ? `${expiry.getFullYear()}年${expiry.getMonth() + 1}月期限`
                              : acc.name.includes("期間")
                                ? "期限未入力"
                                : "期限なし"}
                          </p>
                        </div>
                        <p style={{ margin: 0 }}>{balanceDisplay(acc)}</p>
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 20 }}>
        <Link href="/accounts/quick-update" className="btn-ghost" style={{ textDecoration: "none" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Zap size={13} /> クイック更新
          </span>
        </Link>
      </div>
    </div>
  );
}
