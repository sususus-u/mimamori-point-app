"use client";

// 口座一覧。
// 「期限あり」タブは期限月ごとにグルーピングし、直近3ヶ月は展開・それ以降は折りたたむ。
// 「期限なし」タブは貯蓄枠として別扱い。
// 継続型で期限を過ぎても更新されていない口座は、行の背景色を変えてさりげなく目立たせる。

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, query, where, onSnapshot, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthProvider";
import { CATEGORY_DEFAULTS, type AccountCategory, type AccountDoc } from "@/types/firestore";

interface AccountWithId extends AccountDoc {
  id: string;
}

function formatBalance(balance?: number | null, unit?: string | null) {
  if (balance === undefined || balance === null) return "";
  return unit === "円" ? `¥${balance.toLocaleString()}` : `${balance.toLocaleString()}${unit ?? ""}`;
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

export default function AccountList() {
  const { uid, isLoading } = useAuth();
  const [accounts, setAccounts] = useState<AccountWithId[]>([]);
  const [tab, setTab] = useState<"withExpiry" | "noExpiry" | "byGroup">("withExpiry");
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

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
  const noExpiry = accounts.filter((a) => !a.expiryDate);

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

  // サービス別グルーピング。groupNameが未入力の場合は口座名をそのままキーにする
  const serviceGroups = new Map<string, AccountWithId[]>();
  for (const acc of accounts) {
    const key = acc.groupName?.trim() || acc.name;
    if (!serviceGroups.has(key)) serviceGroups.set(key, []);
    serviceGroups.get(key)!.push(acc);
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
    return <p className="p-6 text-sm text-gray-500">読み込み中です...</p>;
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-lg font-semibold">口座一覧</h1>
        <Link
          href="/accounts/new"
          className="text-sm bg-gray-900 text-white rounded-md px-3 py-1.5"
        >
          + 登録
        </Link>
      </div>

      <div className="flex gap-2 mb-4 border-b">
        <button
          onClick={() => setTab("withExpiry")}
          className={`px-3 py-2 text-sm ${
            tab === "withExpiry" ? "border-b-2 border-gray-900 font-medium" : "text-gray-500"
          }`}
        >
          期限あり
        </button>
        <button
          onClick={() => setTab("noExpiry")}
          className={`px-3 py-2 text-sm ${
            tab === "noExpiry" ? "border-b-2 border-gray-900 font-medium" : "text-gray-500"
          }`}
        >
          期限なし
        </button>
        <button
          onClick={() => setTab("byGroup")}
          className={`px-3 py-2 text-sm ${
            tab === "byGroup" ? "border-b-2 border-gray-900 font-medium" : "text-gray-500"
          }`}
        >
          サービス別
        </button>
      </div>

      {tab === "withExpiry" && (
        <div className="space-y-3">
          {monthKeys.length === 0 && (
            <p className="text-sm text-gray-500">登録された口座がありません</p>
          )}
          {monthKeys.map((key, index) => {
            const isRecent = index < 3;
            const expanded = isRecent || expandedMonths.has(key);
            const items = groups.get(key)!;
            return (
              <div key={key} className="border rounded-md overflow-hidden">
                <button
                  onClick={() => toggleMonth(key)}
                  className="w-full flex justify-between items-center px-3 py-2 text-sm font-medium bg-gray-50"
                >
                  <span>{key}</span>
                  <span className="text-gray-400">{expanded ? "－" : "＋"}</span>
                </button>
                {expanded && (
                  <ul className="divide-y">
                    {items.map((acc) => (
                      <li key={acc.id}>
                        <Link
                          href={`/accounts/${acc.id}/edit`}
                          className={`px-3 py-2 text-sm flex justify-between items-center block ${
                            isOverdueUnupdated(acc) ? "bg-amber-50" : ""
                          }`}
                        >
                          <div>
                            <p className="font-medium">{acc.name}</p>
                            <p className="text-xs text-gray-500">{categoryLabel(acc)}</p>
                          </div>
                          <p>{formatBalance(acc.currentBalance, acc.balanceUnit)}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "noExpiry" && (
        <ul className="divide-y border rounded-md">
          {noExpiry.length === 0 && (
            <li className="px-3 py-4 text-sm text-gray-500">登録された口座がありません</li>
          )}
          {noExpiry.map((acc) => (
            <li key={acc.id}>
              <Link
                href={`/accounts/${acc.id}/edit`}
                className="px-3 py-2 text-sm flex justify-between items-center block"
              >
                <div>
                  <p className="font-medium">{acc.name}</p>
                  <p className="text-xs text-gray-500">{categoryLabel(acc)}</p>
                </div>
                <p>{formatBalance(acc.currentBalance, acc.balanceUnit)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {tab === "byGroup" && (
        <div className="space-y-3">
          {serviceGroupKeys.length === 0 && (
            <p className="text-sm text-gray-500">登録された口座がありません</p>
          )}
          {serviceGroupKeys.map((key) => {
            const items = serviceGroups.get(key)!;
            return (
              <div key={key} className="border rounded-md overflow-hidden">
                <p className="px-3 py-2 text-sm font-medium bg-gray-50">{key}</p>
                <ul className="divide-y">
                  {items.map((acc) => {
                    const expiry = acc.expiryDate
                      ? (acc.expiryDate as Timestamp).toDate()
                      : null;
                    return (
                      <li key={acc.id}>
                        <Link
                          href={`/accounts/${acc.id}/edit`}
                          className={`px-3 py-2 text-sm flex justify-between items-center block ${
                            isOverdueUnupdated(acc) ? "bg-amber-50" : ""
                          }`}
                        >
                          <div>
                            <p className="font-medium">{acc.name}</p>
                            <p className="text-xs text-gray-500">
                              {expiry
                                ? `${expiry.getFullYear()}年${expiry.getMonth() + 1}月期限`
                                : "期限なし"}
                            </p>
                          </div>
                          <p>{formatBalance(acc.currentBalance, acc.balanceUnit)}</p>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
