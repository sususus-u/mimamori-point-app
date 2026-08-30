"use client";

// 実績画面(月次)。
// 完結型(商品券・スタンプカード等)は outcome_events から使いきった/失効した件数を集計。
// 継続型(電子マネー・ポイント等)は各口座の updates 履歴から、選択月内の最初と最後の残高を比較する。
// 履歴が無い月(記録を始める前の過去月)は「データなし」として扱う。

import { useEffect, useState, useCallback } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthProvider";
import type { AccountDoc, OutcomeEventDoc } from "@/types/firestore";

interface OutcomeEventWithId extends OutcomeEventDoc {
  id: string;
}

interface AccountWithId extends AccountDoc {
  id: string;
}

interface ContinuousRow {
  account: AccountWithId;
  startBalance: number | null;
  endBalance: number | null;
  hasData: boolean;
}

function monthLabel(d: Date) {
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

function formatBalance(balance: number | null, unit?: string | null) {
  if (balance === null) return "—";
  return unit === "円" ? `¥${balance.toLocaleString()}` : `${balance.toLocaleString()}${unit ?? ""}`;
}

export default function ReportsPage() {
  const { uid, isLoading } = useAuth();
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [usedUpEvents, setUsedUpEvents] = useState<OutcomeEventWithId[]>([]);
  const [expiredEvents, setExpiredEvents] = useState<OutcomeEventWithId[]>([]);
  const [continuousRows, setContinuousRows] = useState<ContinuousRow[]>([]);
  const [showUsedUpList, setShowUsedUpList] = useState(false);
  const [showExpiredList, setShowExpiredList] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  const load = useCallback(async () => {
    if (!uid) return;
    setIsFetching(true);

    const monthStart = monthCursor;
    const monthEnd = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);

    // 完結型:outcome_events を全件取得し、選択月でクライアント側フィルタする
    const eventsSnap = await getDocs(
      query(collection(db, "outcome_events"), where("ownerId", "==", uid))
    );
    const allEvents: OutcomeEventWithId[] = eventsSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as OutcomeEventDoc),
    }));
    const inMonth = allEvents.filter((e) => {
      const d = (e.eventDate as Timestamp).toDate();
      return d >= monthStart && d < monthEnd;
    });
    setUsedUpEvents(inMonth.filter((e) => e.eventType === "used_up"));
    setExpiredEvents(inMonth.filter((e) => e.eventType === "expired"));

    // 継続型:各口座のupdates履歴から、選択月内の最初/最後の残高を取得
    const accountsSnap = await getDocs(
      query(
        collection(db, "accounts"),
        where("ownerId", "==", uid),
        where("type", "==", "continuous")
      )
    );
    const accounts: AccountWithId[] = accountsSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as AccountDoc),
    }));

    const rows: ContinuousRow[] = await Promise.all(
      accounts.map(async (acc) => {
        const updatesSnap = await getDocs(
          query(
            collection(db, "accounts", acc.id, "updates"),
            where("recordedAt", ">=", Timestamp.fromDate(monthStart)),
            where("recordedAt", "<", Timestamp.fromDate(monthEnd)),
            orderBy("recordedAt", "asc")
          )
        );
        if (updatesSnap.empty) {
          return { account: acc, startBalance: null, endBalance: null, hasData: false };
        }
        const docs = updatesSnap.docs.map((d) => d.data());
        const start = docs[0].balance ?? null;
        const end = docs[docs.length - 1].balance ?? null;
        return { account: acc, startBalance: start, endBalance: end, hasData: true };
      })
    );
    setContinuousRows(rows);
    setIsFetching(false);
  }, [uid, monthCursor]);

  useEffect(() => {
    load();
  }, [load]);

  function changeMonth(delta: number) {
    setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
    setShowUsedUpList(false);
    setShowExpiredList(false);
  }

  const expiredYenTotal = expiredEvents
    .filter((e) => e.isYenBased && typeof e.amount === "number")
    .reduce((sum, e) => sum + (e.amount ?? 0), 0);
  const expiredYenCount = expiredEvents.filter((e) => e.isYenBased).length;
  const expiredNonYenCount = expiredEvents.length - expiredYenCount;

  const withExpiryRows = continuousRows.filter((r) => r.account.expiryDate);
  const noExpiryRows = continuousRows.filter((r) => !r.account.expiryDate);

  if (isLoading) {
    return <p style={{ fontSize: 14, color: "#999" }}>読み込み中です...</p>;
  }

  return (
    <div>
      {/* 月の切り替え */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <button onClick={() => changeMonth(-1)} style={{ background: "none", border: "none" }}>
          <ChevronLeft size={20} color="var(--brand)" />
        </button>
        <p style={{ fontFamily: "var(--font-heading)", fontSize: 16, fontWeight: 700, margin: 0 }}>
          {monthLabel(monthCursor)}
        </p>
        <button onClick={() => changeMonth(1)} style={{ background: "none", border: "none" }}>
          <ChevronRight size={20} color="var(--brand)" />
        </button>
      </div>

      {isFetching && <p style={{ fontSize: 13, color: "#999" }}>集計しています...</p>}

      {!isFetching && (
        <>
          {/* 完結型:使いきった実績(ポジティブ枠) */}
          <div className="card" style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 13, color: "#555", margin: "0 0 4px" }}>今月使いきった</p>
            <p style={{ fontSize: 24, fontFamily: "var(--font-heading)", fontWeight: 700, margin: 0, color: "var(--brand)" }}>
              {usedUpEvents.length}件
            </p>
            {usedUpEvents.length > 0 && (
              <button
                onClick={() => setShowUsedUpList((v) => !v)}
                className="collapse-toggle"
                style={{ padding: "6px 0 0" }}
              >
                {showUsedUpList ? "－ 閉じる" : "＋ 内訳を見る"}
              </button>
            )}
            {showUsedUpList && (
              <div style={{ marginTop: 8 }}>
                {usedUpEvents.map((e) => (
                  <p key={e.id} style={{ fontSize: 13, margin: "4px 0" }}>
                    {e.accountName}(
                    {(e.eventDate as Timestamp).toDate().toLocaleDateString("ja-JP")})
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* 完結型:失効した件数 */}
          <div className="card" style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 13, color: "#555", margin: "0 0 4px" }}>今月失効</p>
            <p style={{ fontSize: 24, fontFamily: "var(--font-heading)", fontWeight: 700, margin: 0 }}>
              {expiredEvents.length}件
              {expiredYenCount > 0 && `(¥${expiredYenTotal.toLocaleString()})`}
            </p>
            {expiredNonYenCount > 0 && (
              <p style={{ fontSize: 12, color: "#999", margin: "2px 0 0" }}>
                非円建て:{expiredNonYenCount}件
              </p>
            )}
            {expiredEvents.length > 0 && (
              <button
                onClick={() => setShowExpiredList((v) => !v)}
                className="collapse-toggle"
                style={{ padding: "6px 0 0" }}
              >
                {showExpiredList ? "－ 閉じる" : "＋ 内訳を見る"}
              </button>
            )}
            {showExpiredList && (
              <div style={{ marginTop: 8 }}>
                {expiredEvents.map((e) => (
                  <p key={e.id} style={{ fontSize: 13, margin: "4px 0" }}>
                    {e.accountName}(
                    {(e.eventDate as Timestamp).toDate().toLocaleDateString("ja-JP")})
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* 継続型:残高の推移 */}
          <p style={{ fontSize: 13, color: "#999", margin: "20px 0 8px" }}>残高の推移(継続型)</p>

          <p style={{ fontSize: 12, color: "#999", margin: "0 0 6px" }}>期限あり残高</p>
          <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 12 }}>
            {withExpiryRows.length === 0 && (
              <p style={{ fontSize: 13, color: "#999", padding: 14 }}>対象のサービスがありません</p>
            )}
            {withExpiryRows.map((row) => (
              <div
                key={row.account.id}
                style={{
                  padding: "12px 14px",
                  borderTop: "0.5px solid #f0f0f0",
                  fontSize: 14,
                }}
              >
                <p style={{ margin: "0 0 2px", fontWeight: 500 }}>{row.account.name}</p>
                <p style={{ margin: 0, fontSize: 13, color: row.hasData ? "#555" : "#bbb" }}>
                  {row.hasData
                    ? `${formatBalance(row.startBalance, row.account.balanceUnit)} → ${formatBalance(row.endBalance, row.account.balanceUnit)}`
                    : "この月の記録はありません"}
                </p>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 12, color: "#999", margin: "0 0 6px" }}>期限なし残高</p>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            {noExpiryRows.length === 0 && (
              <p style={{ fontSize: 13, color: "#999", padding: 14 }}>対象のサービスがありません</p>
            )}
            {noExpiryRows.map((row) => (
              <div
                key={row.account.id}
                style={{
                  padding: "12px 14px",
                  borderTop: "0.5px solid #f0f0f0",
                  fontSize: 14,
                }}
              >
                <p style={{ margin: "0 0 2px", fontWeight: 500 }}>{row.account.name}</p>
                <p style={{ margin: 0, fontSize: 13, color: row.hasData ? "#555" : "#bbb" }}>
                  {row.hasData
                    ? `${formatBalance(row.startBalance, row.account.balanceUnit)} → ${formatBalance(row.endBalance, row.account.balanceUnit)}`
                    : "この月の記録はありません"}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
