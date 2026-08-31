"use client";

// 口座一覧。AppShellの中に表示される想定(独自のヘッダーは持たない)。
// 「期限あり」タブは期限月ごとにグルーピングし、直近3ヶ月は展開・それ以降は折りたたむ。
// 「期限なし」タブは貯蓄枠として別扱い。「サービス別」タブはグループ名でまとめる。
// 登録・スクショの導線は /accounts/new 側の大きなCTAに集約したため、ここでは持たない。
// クイック更新のみ、控えめなリンクとして残す。

import { useEffect, useState } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { collection, query, where, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthProvider";
import { CATEGORY_DEFAULTS, type AccountCategory, type AccountDoc } from "@/types/firestore";
import NotificationSetup from "@/components/NotificationSetup";

interface AccountWithId extends AccountDoc {
  id: string;
}

function formatBalance(balance?: number | null, unit?: string | null) {
  if (balance === undefined || balance === null) return "";
  return unit === "円" ? `¥${balance.toLocaleString()}` : `${balance.toLocaleString()}${unit ?? ""}`;
}

function balanceDisplay(acc: AccountWithId) {
  if (
    acc.faceValue !== undefined &&
    acc.faceValue !== null &&
    acc.itemQuantity !== undefined &&
    acc.itemQuantity !== null
  ) {
    return `¥${acc.faceValue.toLocaleString()} × ${acc.itemQuantity}枚 = ${formatBalance(
      acc.currentBalance,
      acc.balanceUnit
    )}`;
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
  const yenItems = list.filter((a) => a.isYenBased && typeof a.currentBalance === "number");
  const others = list.filter((a) => !(a.isYenBased && typeof a.currentBalance === "number"));
  yenItems.sort((a, b) => (b.currentBalance ?? 0) - (a.currentBalance ?? 0));
  others.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  return [...yenItems, ...others];
}

export default function AccountList() {
  const { uid, isLoading } = useAuth();
  const [accounts, setAccounts] = useState<AccountWithId[]>([]);
  const [tab, setTab] = useState<"withExpiry" | "noExpiry" | "byGroup">("withExpiry");
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [sortMode, setSortMode] = useState<"balance" | "name">("balance");
  const [withExpirySortMode, setWithExpirySortMode] = useState<"expiry" | "balance" | "name">(
    "expiry"
  );

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

  const withExpiry = accounts.filter((a) => a.expiryDate);
  const noExpiry = sortAccounts(
    accounts.filter((a) => !a.expiryDate),
    sortMode
  );

  const sorted = [...withExpiry].sort((a, b) => {
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
    serviceGroups.set(key, sortAccounts(items, sortMode));
  }
  const serviceGroupKeys = Array.from(serviceGroups.keys()).sort((a, b) =>
    a.localeCompare(b, "ja")
  );

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
      <div style={{ marginBottom: 16 }}>
        <NotificationSetup />
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
          { key: "withExpiry", label: "期限あり" },
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
              {monthKeys.length === 0 && (
                <p style={{ fontSize: 14, color: "#999" }}>登録されたサービスがありません</p>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {serviceGroupKeys.length === 0 && (
              <p style={{ fontSize: 14, color: "#999" }}>登録されたサービスがありません</p>
            )}
            {serviceGroupKeys.map((key) => {
              const items = serviceGroups.get(key)!;
              return (
                <div key={key} className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <p style={{ margin: 0, padding: "10px 14px", fontSize: 13, fontWeight: 500, background: "#faf8f6" }}>
                    {key}
                  </p>
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
                            {expiry ? `${expiry.getFullYear()}年${expiry.getMonth() + 1}月期限` : "期限なし"}
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
