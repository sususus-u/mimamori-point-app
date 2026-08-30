"use client";

// クイック更新画面。
// スクショが使えないサービス向けに、残高・期限の2項目だけを最小タップ数で更新できるようにする。
// 対象は継続型(電子マネー・ポイント・マイル等)の口座のみ。完結型は使いきり/失効の実績に関わるため対象外。

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lightbulb } from "lucide-react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthProvider";
import type { AccountDoc } from "@/types/firestore";

interface AccountWithId extends AccountDoc {
  id: string;
}

interface EditingRow {
  account: AccountWithId;
  balance: string;
  expiryDate: string;
}

function toDateInputValue(timestamp?: Timestamp | null): string {
  if (!timestamp) return "";
  const d = timestamp.toDate();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function QuickUpdate() {
  const { uid, isLoading } = useAuth();
  const [accounts, setAccounts] = useState<AccountWithId[]>([]);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [editingRows, setEditingRows] = useState<EditingRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, "accounts"),
      where("ownerId", "==", uid),
      where("type", "==", "continuous")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: AccountWithId[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as AccountDoc),
      }));
      list.sort((a, b) => a.name.localeCompare(b.name, "ja"));
      setAccounts(list);
    });
    return () => unsubscribe();
  }, [uid]);

  // グループ名(未設定なら口座名)でまとめる。例:「楽天ポイント」に通常/期間限定の2口座
  const groups = new Map<string, AccountWithId[]>();
  for (const acc of accounts) {
    const key = acc.groupName?.trim() || acc.name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(acc);
  }
  const groupKeys = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b, "ja"));

  function selectGroup(key: string) {
    const items = groups.get(key)!;
    setSelectedGroupKey(key);
    setSavedMessage("");
    setEditingRows(
      items.map((acc) => ({
        account: acc,
        balance:
          acc.currentBalance === undefined || acc.currentBalance === null
            ? ""
            : String(acc.currentBalance),
        expiryDate: toDateInputValue(acc.expiryDate as Timestamp | undefined),
      }))
    );
  }

  function updateRow(index: number, field: "balance" | "expiryDate", value: string) {
    setEditingRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  async function handleSaveAll() {
    setIsSaving(true);
    try {
      await Promise.all(
        editingRows.map((row) =>
          updateDoc(doc(db, "accounts", row.account.id), {
            currentBalance: row.balance === "" ? null : Number(row.balance),
            expiryDate: row.expiryDate ? Timestamp.fromDate(new Date(row.expiryDate)) : null,
            lastUpdatedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        )
      );
      setSavedMessage(`「${selectedGroupKey}」を更新しました`);
      setSelectedGroupKey(null);
      setEditingRows([]);
    } catch (error) {
      console.error(error);
      setSavedMessage("保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <p className="p-6 text-sm text-gray-500">読み込み中です...</p>;
  }

  // グループ選択画面
  if (!selectedGroupKey) {
    return (
      <div className="max-w-md mx-auto p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h1 className="text-lg font-semibold">クイック更新</h1>
          <Link href="/" className="text-sm text-gray-500">
            一覧へ戻る
          </Link>
        </div>
        <p className="text-sm text-gray-500">更新するサービスを選んでください</p>
        <p className="text-xs text-gray-400 flex items-center gap-1">
          <Lightbulb size={12} className="shrink-0" />
          スマホの画面分割機能を使うと、サービスのアプリと見比べながら入力できて便利です
        </p>

        {savedMessage && <p className="text-sm text-green-700">{savedMessage}</p>}

        <ul className="divide-y border rounded-md">
          {groupKeys.length === 0 && (
            <li className="px-3 py-4 text-sm text-gray-500">
              継続型のサービスがまだ登録されていません
            </li>
          )}
          {groupKeys.map((key) => {
            const items = groups.get(key)!;
            return (
              <li key={key}>
                <button
                  onClick={() => selectGroup(key)}
                  className="w-full text-left px-4 py-3 text-base flex justify-between items-center"
                >
                  <span>{key}</span>
                  {items.length > 1 && (
                    <span className="text-xs text-gray-400">{items.length}件まとめて</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // 入力画面(残高・期限のみ。グループ内の口座数だけ行が並ぶ)
  return (
    <div className="max-w-md mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-semibold">{selectedGroupKey}</h1>
        <button onClick={() => setSelectedGroupKey(null)} className="text-sm text-gray-500">
          戻る
        </button>
      </div>

      {editingRows.map((row, index) => (
        <div key={row.account.id} className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
          {editingRows.length > 1 && (
            <p className="text-sm font-medium text-gray-700">{row.account.name}</p>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">残高</label>
            <input
              type="number"
              inputMode="numeric"
              value={row.balance}
              onChange={(e) => updateRow(index, "balance", e.target.value)}
              autoFocus={index === 0}
              className="w-full border rounded-md px-4 py-4 text-2xl text-center"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">有効期限</label>
            <input
              type="date"
              value={row.expiryDate}
              onChange={(e) => updateRow(index, "expiryDate", e.target.value)}
              className="w-full border rounded-md px-4 py-3 text-lg"
            />
          </div>
        </div>
      ))}

      <button
        onClick={handleSaveAll}
        disabled={isSaving}
        className="w-full bg-gray-900 text-white rounded-md py-3 text-base font-medium disabled:opacity-50"
      >
        {isSaving ? "保存中..." : "保存する"}
      </button>
    </div>
  );
}
