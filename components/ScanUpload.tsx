"use client";

// スクショアップロード画面。
// 1) 画像を選ぶ → 2) サーバーでAIが読み取り → 3a) 同名口座があれば、現在値と読み取り値を
// 並べた確認画面を挟んでから、本人の操作で保存(自動保存はしない)
// 3b) 初めてのサービスなら、内容を事前入力した登録フォームへ遷移(そちらも確認・保存操作が必要)。

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lightbulb } from "lucide-react";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  addDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthProvider";
import { guessServiceInfo, normalizeServiceName } from "@/lib/knownServices";
import type { AccountDoc } from "@/types/firestore";

interface PrefillItem {
  name: string;
  groupName: string;
  category: string;
  isYenBased: boolean;
  balance: number | string;
  balanceUnit: string;
  expiryDate: string;
  // 読み取りの確信度が低い項目(true の場合、フォーム側で要注意表示をする)
  balanceLowConfidence: boolean;
  expiryLowConfidence: boolean;
}

interface MatchItem {
  docId: string;
  name: string;
  currentBalance: number | null;
  currentBalanceUnit: string | null;
  currentExpiryDate: string; // yyyy-mm-dd。未設定は空文字
  editBalance: string;
  editBalanceUnit: string;
  editExpiryDate: string;
  // 読み取りの確信度が低い項目(true の場合、枠色と注意文で強調する)
  balanceLowConfidence: boolean;
  expiryLowConfidence: boolean;
  // 「別サービスとして登録」を選んだ場合に使う名前(重複しない連番付きの名前を初期値にする)
  newName: string;
  // 「別サービスとして登録」時、既存口座から引き継ぐ設定値(category・通知タイミング等)
  sourceAccount: Pick<
    AccountDoc,
    | "category"
    | "customCategoryLabel"
    | "isYenBased"
    | "type"
    | "notificationTiming"
    | "groupName"
    | "storageLocationMemo"
    | "yenExchangeRate"
    | "exchangeUnitCount"
    | "exchangeUnitYen"
  >;
}

function timestampToInputValue(timestamp?: Timestamp | null): string {
  if (!timestamp) return "";
  const d = timestamp.toDate();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// 「PayPay」→「PayPay(2)」のように、既存アカウントと重複しない名前を探す。
// 「PayPay(2)」まで既にあれば「PayPay(3)」を返す。
async function suggestUniqueName(uid: string, baseName: string): Promise<string> {
  let n = 2;
  for (;;) {
    const candidate = `${baseName}(${n})`;
    const q = query(
      collection(db, "accounts"),
      where("ownerId", "==", uid),
      where("name", "==", candidate)
    );
    const snap = await getDocs(q);
    if (snap.empty) return candidate;
    n++;
  }
}

export default function ScanUpload() {
  const router = useRouter();
  const { uid } = useAuth();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  // 既存口座と一致した項目。null の間は確認画面を出さない
  const [matchItems, setMatchItems] = useState<MatchItem[] | null>(null);
  // 確認画面での保存後に、続けて新規登録フォームへ渡す項目
  const [pendingQueueItems, setPendingQueueItems] = useState<PrefillItem[]>([]);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uid) return;

    setErrorMessage("");
    setStatusMessage("");
    setMatchItems(null);
    setPendingQueueItems([]);
    setPreviewUrl(URL.createObjectURL(file));
    setIsProcessing(true);

    try {
      const base64 = await fileToBase64(file);

      setStatusMessage("画像を読み取っています...");
      const res = await fetch("/api/scan-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType: file.type }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "読み取りに失敗しました");
      }

      const serviceName: string | null = data.serviceName;
      const totalBalance: number | null = data.totalBalance;
      const totalBalanceLowConfidence: boolean = data.totalBalanceConfidence === "low";
      const balanceUnit: string | null = data.balanceUnit;
      const expiryDate: string | null = data.expiryDate;
      const expiryDateLowConfidence: boolean = data.expiryDateConfidence === "low";
      const limitedPortion: {
        balance: number;
        balanceConfidence?: string;
        expiryDate: string | null;
        expiryDateConfidence?: string;
      } | null = data.limitedPortion;
      const investedPortion: number | null = data.investedPortion;

      if (!serviceName) {
        setErrorMessage("サービス名を読み取れませんでした。手入力で登録してください。");
        setIsProcessing(false);
        return;
      }

      const { groupName, accountName, investedAccountName } = normalizeServiceName(serviceName);

      setStatusMessage("既存のサービスを確認しています...");

      // 内訳(期間・用途限定ポイント等)が見つかった場合は、通常分/限定分の2口座に分けて扱う。
      // 実際に値が読み取れなかった項目については、空の確認項目を出さないようtargetを作らない。
      const targets: {
        name: string;
        balance: number | null;
        balanceLowConfidence: boolean;
        expiryDate: string | null;
        expiryLowConfidence: boolean;
      }[] = [];

      if (limitedPortion) {
        if (totalBalance !== null) {
          targets.push({
            name: `${accountName}(通常)`,
            balance: totalBalance - limitedPortion.balance,
            balanceLowConfidence: totalBalanceLowConfidence,
            expiryDate,
            expiryLowConfidence: expiryDateLowConfidence,
          });
        }
        targets.push({
          name: `${accountName}(期間限定)`,
          balance: limitedPortion.balance,
          balanceLowConfidence: limitedPortion.balanceConfidence === "low",
          expiryDate: limitedPortion.expiryDate,
          expiryLowConfidence: limitedPortion.expiryDateConfidence === "low",
        });
      } else if (totalBalance !== null) {
        targets.push({
          name: accountName,
          balance: totalBalance,
          balanceLowConfidence: totalBalanceLowConfidence,
          expiryDate,
          expiryLowConfidence: expiryDateLowConfidence,
        });
      }

      // 保有ポイント(運用中など)が見つかった場合は、targetとして追加する
      if (investedPortion !== null && investedPortion !== undefined) {
        targets.push({
          name: investedAccountName,
          balance: investedPortion,
          balanceLowConfidence: false,
          expiryDate: null,
          expiryLowConfidence: false,
        });
      }

      if (targets.length === 0) {
        setIsProcessing(false);
        setStatusMessage("");
        setErrorMessage("読み取れる項目が見つかりませんでした。手入力で登録してください。");
        return;
      }

      const newMatchItems: MatchItem[] = [];
      const queueItems: PrefillItem[] = [];

      for (const target of targets) {
        const q = query(
          collection(db, "accounts"),
          where("ownerId", "==", uid),
          where("name", "==", target.name)
        );
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          const existing = snapshot.docs[0];
          const existingData = existing.data() as AccountDoc;
          const suggestedNewName = await suggestUniqueName(uid, target.name);
          newMatchItems.push({
            docId: existing.id,
            name: target.name,
            currentBalance: existingData.currentBalance ?? null,
            currentBalanceUnit: existingData.balanceUnit ?? null,
            currentExpiryDate: timestampToInputValue(existingData.expiryDate),
            editBalance: target.balance !== null ? String(target.balance) : "",
            editBalanceUnit: balanceUnit ?? existingData.balanceUnit ?? "",
            editExpiryDate: target.expiryDate ?? "",
            balanceLowConfidence: target.balance !== null && target.balanceLowConfidence,
            expiryLowConfidence: target.expiryDate !== null && target.expiryLowConfidence,
            newName: suggestedNewName,
            sourceAccount: {
              category: existingData.category,
              customCategoryLabel: existingData.customCategoryLabel,
              isYenBased: existingData.isYenBased,
              type: existingData.type,
              notificationTiming: existingData.notificationTiming,
              groupName: existingData.groupName,
              storageLocationMemo: existingData.storageLocationMemo,
              yenExchangeRate: existingData.yenExchangeRate,
              exchangeUnitCount: existingData.exchangeUnitCount,
              exchangeUnitYen: existingData.exchangeUnitYen,
            },
          });
        } else {
          const guess = guessServiceInfo(accountName, balanceUnit);
          queueItems.push({
            name: target.name,
            groupName,
            category: guess.category,
            isYenBased: guess.isYenBased,
            balance: target.balance ?? "",
            balanceUnit: balanceUnit ?? (guess.isYenBased ? "円" : ""),
            expiryDate: target.expiryDate ?? "",
            balanceLowConfidence: target.balance !== null && target.balanceLowConfidence,
            expiryLowConfidence: target.expiryDate !== null && target.expiryLowConfidence,
          });
        }
      }

      setIsProcessing(false);
      setStatusMessage("");

      // 既存口座と一致した項目があれば、確認画面を出して本人の保存操作を待つ(自動保存はしない)
      if (newMatchItems.length > 0) {
        setMatchItems(newMatchItems);
        setPendingQueueItems(queueItems);
        return;
      }

      if (queueItems.length === 0) {
        setErrorMessage("読み取れる内容がありませんでした。手入力で登録してください。");
        return;
      }

      sessionStorage.setItem(
        "scan-prefill-queue",
        JSON.stringify({ total: queueItems.length, items: queueItems })
      );
      router.push("/accounts/new");
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : "読み取りに失敗しました");
      setIsProcessing(false);
    }
  }

  function updateMatchField(
    index: number,
    field: "editBalance" | "editBalanceUnit" | "editExpiryDate" | "newName",
    value: string
  ) {
    setMatchItems((prev) =>
      prev ? prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)) : prev
    );
  }

  // 確認画面での保存が終わった後、新規登録が必要な項目(pendingQueueItems)があれば続けてそちらへ、
  // なければホームへ遷移する
  function goToPendingQueueOrHome(successMessage: string) {
    if (pendingQueueItems.length > 0) {
      sessionStorage.setItem(
        "scan-prefill-queue",
        JSON.stringify({ total: pendingQueueItems.length, items: pendingQueueItems })
      );
      router.push("/accounts/new");
      return;
    }

    setMatchItems(null);
    setStatusMessage(successMessage);
    setTimeout(() => router.push("/"), 800);
  }

  async function handleConfirmSave() {
    if (!matchItems) return;
    setIsSaving(true);
    setErrorMessage("");
    try {
      await Promise.all(
        matchItems.map((item) =>
          updateDoc(doc(db, "accounts", item.docId), {
            currentBalance: item.editBalance === "" ? null : Number(item.editBalance),
            balanceUnit: item.editBalanceUnit || null,
            expiryDate: item.editExpiryDate ? Timestamp.fromDate(new Date(item.editExpiryDate)) : null,
            lastUpdatedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        )
      );

      goToPendingQueueOrHome("更新しました");
    } catch (error) {
      console.error(error);
      setErrorMessage("保存に失敗しました。もう一度お試しください。");
    } finally {
      setIsSaving(false);
    }
  }

  // 「別サービスとして登録」: 既存口座は変更せず、読み取った内容を新しい名前の別口座として登録する
  async function handleRegisterAsNew() {
    if (!matchItems || !uid) return;
    for (const item of matchItems) {
      if (!item.newName.trim()) {
        setErrorMessage("名前を入力してください。");
        return;
      }
    }

    setIsSaving(true);
    setErrorMessage("");
    try {
      await Promise.all(
        matchItems.map(async (item) => {
          const now = serverTimestamp();
          const payload: Omit<AccountDoc, "createdAt" | "updatedAt" | "lastUpdatedAt"> & {
            createdAt: ReturnType<typeof serverTimestamp>;
            updatedAt: ReturnType<typeof serverTimestamp>;
            lastUpdatedAt: ReturnType<typeof serverTimestamp>;
          } = {
            ownerId: uid,
            name: item.newName.trim(),
            category: item.sourceAccount.category,
            ...(item.sourceAccount.customCategoryLabel !== undefined
              ? { customCategoryLabel: item.sourceAccount.customCategoryLabel }
              : {}),
            groupName: item.sourceAccount.groupName,
            isYenBased: item.sourceAccount.isYenBased,
            type: item.sourceAccount.type,
            yenExchangeRate: item.sourceAccount.yenExchangeRate,
            exchangeUnitCount: item.sourceAccount.exchangeUnitCount,
            exchangeUnitYen: item.sourceAccount.exchangeUnitYen,
            currentBalance: item.editBalance === "" ? undefined : Number(item.editBalance),
            balanceUnit: item.editBalanceUnit || undefined,
            expiryDate: item.editExpiryDate ? Timestamp.fromDate(new Date(item.editExpiryDate)) : null,
            storageLocationMemo: item.sourceAccount.storageLocationMemo,
            notificationTiming: item.sourceAccount.notificationTiming,
            createdAt: now,
            updatedAt: now,
            lastUpdatedAt: now,
          };
          const docRef = await addDoc(collection(db, "accounts"), payload);
          await addDoc(collection(db, "accounts", docRef.id, "updates"), {
            recordedAt: now,
            balance: item.editBalance === "" ? undefined : Number(item.editBalance),
            expiryDate: item.editExpiryDate ? Timestamp.fromDate(new Date(item.editExpiryDate)) : null,
            source: "screenshot" as const,
            confirmedByUser: true,
          });
        })
      );

      goToPendingQueueOrHome("別サービスとして登録しました");
    } catch (error) {
      console.error(error);
      setErrorMessage("保存に失敗しました。もう一度お試しください。");
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancelConfirm() {
    setMatchItems(null);
    setPendingQueueItems([]);
    setPreviewUrl(null);
    setStatusMessage("");
  }

  if (matchItems) {
    return (
      <div className="max-w-md mx-auto p-6 space-y-4">
        <h1 className="text-lg font-semibold">読み取り内容の確認</h1>
        <p className="text-sm text-gray-500">
          既に同じ名前のサービスがあります。内容を確認・修正してから保存してください。
        </p>

        {matchItems.map((item, index) => (
          <div key={item.docId} className="border rounded-md p-4 space-y-3">
            <p className="text-sm font-medium">{item.name}</p>

            <p className="text-xs text-gray-500">
              現在の値:{" "}
              {item.currentBalance !== null
                ? `${item.currentBalance}${item.currentBalanceUnit ?? ""}`
                : "未設定"}
              {" / 期限: "}
              {item.currentExpiryDate || "未設定"}
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium mb-1">新しい残高</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={item.editBalance}
                  onChange={(e) => updateMatchField(index, "editBalance", e.target.value)}
                  className={`w-full border rounded-md px-3 py-2 text-base ${
                    item.balanceLowConfidence ? "border-amber-400 bg-amber-50" : ""
                  }`}
                />
                {item.balanceLowConfidence && (
                  <p className="text-xs text-amber-600 mt-1">読み取りに自信が持てませんでした。確認してください</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">単位</label>
                <input
                  type="text"
                  value={item.editBalanceUnit}
                  onChange={(e) => updateMatchField(index, "editBalanceUnit", e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-base"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">新しい有効期限</label>
              <input
                type="date"
                value={item.editExpiryDate}
                onChange={(e) => updateMatchField(index, "editExpiryDate", e.target.value)}
                className={`w-full border rounded-md px-3 py-2 text-base ${
                  item.expiryLowConfidence ? "border-amber-400 bg-amber-50" : ""
                }`}
              />
              {item.expiryLowConfidence && (
                <p className="text-xs text-amber-600 mt-1">読み取りに自信が持てませんでした。確認してください</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                別サービスとして登録する場合の名前
              </label>
              <input
                type="text"
                value={item.newName}
                onChange={(e) => updateMatchField(index, "newName", e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-base"
              />
            </div>
          </div>
        ))}

        {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

        <div className="flex flex-col gap-2">
          <button
            onClick={handleCancelConfirm}
            disabled={isSaving}
            className="w-full border rounded-md py-3 text-base font-medium disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleRegisterAsNew}
            disabled={isSaving}
            className="w-full border rounded-md py-3 text-base font-medium disabled:opacity-50"
          >
            {isSaving ? "保存中..." : "別サービスとして登録"}
          </button>
          <button
            onClick={handleConfirmSave}
            disabled={isSaving}
            className="w-full bg-gray-900 text-white rounded-md py-3 text-base font-medium disabled:opacity-50"
          >
            {isSaving ? "更新中..." : "この内容で更新する"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: "#999" }}>
        残高・期限が写ったスクリーンショットを選んでください。同じ名前のサービスがすでにあれば内容を確認してから更新し、初めてのサービスなら内容確認画面に進みます。
      </p>
      <Link href="/accounts/scan-physical" style={{ fontSize: 13, color: "var(--brand)", textDecoration: "underline" }}>
        切手・紙の商品券などの現物はこちら →
      </Link>
      <p style={{ fontSize: 13, color: "#999", display: "flex", alignItems: "flex-start", gap: 4, marginTop: 8 }}>
        <Lightbulb size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        バーコード決済画面はスクショできないことがあります。ポイント残高だけの画面に移動してから撮影すると成功しやすいです
      </p>

      <div className="field" style={{ marginTop: 20 }}>
        <input type="file" accept="image/*" onChange={handleFileChange} disabled={isProcessing} />
      </div>

      {previewUrl && (
        <div className="card" style={{ padding: 8, marginBottom: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="選択した画像のプレビュー"
            style={{ width: "100%", maxHeight: 256, objectFit: "contain", borderRadius: 10 }}
          />
        </div>
      )}

      {statusMessage && <p style={{ fontSize: 13, color: "#999" }}>{statusMessage}</p>}
      {errorMessage && (
        <div>
          <p style={{ fontSize: 13, color: "#b3261e" }}>{errorMessage}</p>
          <div className="action-row" style={{ marginTop: 8 }}>
            <Link
              href="/accounts/quick-update"
              className="btn-outline"
              style={{ textAlign: "center", textDecoration: "none" }}
            >
              クイック更新へ
            </Link>
            <Link
              href="/accounts/new"
              className="btn-outline-warm"
              style={{ textAlign: "center", textDecoration: "none" }}
            >
              手入力で登録する
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
