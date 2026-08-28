"use client";

// 口座登録・編集フォーム。
// accountId が渡されると編集モードになり、既存データを読み込んで更新・削除ができる。
// 種類を選ぶと、CATEGORY_DEFAULTS から円建てフラグ・タイプ・通知タイミングの
// 初期値が自動で入る。ポイント・その他は円建て/非円建てをユーザーが選び直せる。

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera } from "lucide-react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthProvider";
import { CATEGORY_DEFAULTS, type AccountCategory, type AccountType, type AccountDoc } from "@/types/firestore";

const CATEGORY_OPTIONS: { value: AccountCategory; label: string }[] = [
  { value: "electronic_money", label: "電子マネー" },
  { value: "points", label: "ポイント" },
  { value: "gift_certificate", label: "商品券・ギフトカード" },
  { value: "miles", label: "マイル" },
  { value: "coupon", label: "クーポン" },
  { value: "stamp_card", label: "スタンプカード" },
  { value: "other", label: "その他" },
];

// 手入力時、グループ名の候補として出す主要サービス名(大手のみ・随時追加可)
// Pay系は残高・ポイントの両方が候補に出るよう、口座名の候補は別途分けて用意
const KNOWN_SERVICE_NAMES = [
  "PayPay",
  "au PAY",
  "LINE Pay",
  "楽天ポイント",
  "dポイント",
  "Pontaポイント",
  "Vポイント",
  "WAON",
  "nanaco",
  "Suica",
  "PASMO",
  "Amazonギフト券",
  "図書カード",
  "ANAマイレージクラブ",
  "JALマイレージバンク",
];

export default function AccountForm({ accountId }: { accountId?: string }) {
  const router = useRouter();
  const { uid, isLoading } = useAuth();
  const isEditMode = Boolean(accountId);

  const [name, setName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [category, setCategory] = useState<AccountCategory>("electronic_money");
  const [customCategoryLabel, setCustomCategoryLabel] = useState("");
  const [isYenBased, setIsYenBased] = useState(CATEGORY_DEFAULTS.electronic_money.isYenBased);
  const [accountType, setAccountType] = useState<AccountType>(CATEGORY_DEFAULTS.electronic_money.type);
  const [balance, setBalance] = useState("");
  const [balanceUnit, setBalanceUnit] = useState("円");
  const [expiryDate, setExpiryDate] = useState("");
  const [storageLocationMemo, setStorageLocationMemo] = useState("");
  const [firstStageDays, setFirstStageDays] = useState(
    CATEGORY_DEFAULTS.electronic_money.notificationDaysBefore[0]
  );
  const [secondStageDays, setSecondStageDays] = useState(
    CATEGORY_DEFAULTS.electronic_money.notificationDaysBefore[1]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFetchingExisting, setIsFetchingExisting] = useState(isEditMode);
  const [errorMessage, setErrorMessage] = useState("");
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number } | null>(
    null
  );
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const isStampCard = category === "stamp_card";
  const isOther = category === "other";

  // 編集モードの場合、既存データを読み込んでフォームに反映する
  useEffect(() => {
    if (!accountId) return;
    let isCancelled = false;

    async function fetchExisting() {
      try {
        const snap = await getDoc(doc(db, "accounts", accountId!));
        if (isCancelled || !snap.exists()) return;
        const data = snap.data() as AccountDoc;

        setName(data.name ?? "");
        setGroupName(data.groupName ?? "");
        setCategory(data.category);
        setCustomCategoryLabel(data.customCategoryLabel ?? "");
        setIsYenBased(data.isYenBased);
        setAccountType(data.type);
        setBalance(
          data.currentBalance === undefined || data.currentBalance === null
            ? ""
            : String(data.currentBalance)
        );
        setBalanceUnit(data.balanceUnit ?? "円");
        if (data.expiryDate) {
          const d = (data.expiryDate as Timestamp).toDate();
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          setExpiryDate(`${yyyy}-${mm}-${dd}`);
        }
        setStorageLocationMemo(data.storageLocationMemo ?? "");
        setFirstStageDays(data.notificationTiming?.firstStageDays ?? 90);
        setSecondStageDays(data.notificationTiming?.secondStageDays ?? 21);
      } catch (error) {
        console.error(error);
        setErrorMessage("データの読み込みに失敗しました。");
      } finally {
        if (!isCancelled) setIsFetchingExisting(false);
      }
    }

    fetchExisting();
    return () => {
      isCancelled = true;
    };
  }, [accountId]);

  // 新規登録時のみ、スクショ読み取り結果(sessionStorageのキュー)があれば事前入力する。
  // 内訳分割(通常/期間限定など)で複数口座がある場合、1件登録するたびに次の項目へ進む。
  useEffect(() => {
    if (accountId) return;
    const raw = sessionStorage.getItem("scan-prefill-queue");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        total: number;
        items: Array<{
          name?: string;
          groupName?: string;
          category?: AccountCategory;
          isYenBased?: boolean;
          balance?: string | number;
          balanceUnit?: string;
          expiryDate?: string;
        }>;
      };
      const data = parsed.items[0];
      if (!data) return;

      setScanProgress({ current: parsed.total - parsed.items.length + 1, total: parsed.total });

      if (data.name) setName(data.name);
      if (data.groupName) setGroupName(data.groupName);
      if (data.category) {
        setCategory(data.category);
        const defaults = CATEGORY_DEFAULTS[data.category];
        setAccountType(defaults.type);
        setFirstStageDays(defaults.notificationDaysBefore[0]);
        setSecondStageDays(defaults.notificationDaysBefore[1]);
      }
      if (typeof data.isYenBased === "boolean") setIsYenBased(data.isYenBased);
      if (data.balance !== undefined && data.balance !== "") setBalance(String(data.balance));
      if (data.balanceUnit) setBalanceUnit(data.balanceUnit);
      if (data.expiryDate) setExpiryDate(data.expiryDate);
    } catch (error) {
      console.error(error);
    }
  }, [accountId]);

  function handleCategoryChange(newCategory: AccountCategory) {
    setCategory(newCategory);
    const defaults = CATEGORY_DEFAULTS[newCategory];
    setIsYenBased(defaults.isYenBased);
    setAccountType(defaults.type);
    setFirstStageDays(defaults.notificationDaysBefore[0]);
    setSecondStageDays(defaults.notificationDaysBefore[1]);
    setBalanceUnit(defaults.isYenBased ? "円" : "");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage("");

    if (!uid) {
      setErrorMessage("ログイン処理が完了していません。少し待ってからもう一度お試しください。");
      return;
    }
    if (!name.trim()) {
      setErrorMessage("名前を入力してください。");
      return;
    }
    if (isOther && !customCategoryLabel.trim()) {
      setErrorMessage("「その他」を選んだ場合は、種類の名前を入力してください。");
      return;
    }

    setIsSubmitting(true);
    try {
      const now = serverTimestamp();
      const payload = {
        ownerId: uid,
        name: name.trim(),
        groupName: groupName.trim() || null,
        category,
        ...(isOther ? { customCategoryLabel: customCategoryLabel.trim() } : {}),
        isYenBased,
        type: accountType,
        ...(isStampCard
          ? {}
          : {
              currentBalance: balance === "" ? null : Number(balance),
              balanceUnit,
            }),
        expiryDate: expiryDate ? Timestamp.fromDate(new Date(expiryDate)) : null,
        storageLocationMemo: storageLocationMemo.trim() || null,
        notificationTiming: {
          firstStageDays: Number(firstStageDays),
          secondStageDays: Number(secondStageDays),
        },
        lastUpdatedAt: now,
        updatedAt: now,
      };

      if (isEditMode && accountId) {
        await updateDoc(doc(db, "accounts", accountId), payload);
        router.push("/");
      } else {
        await addDoc(collection(db, "accounts"), { ...payload, createdAt: now });

        // スクショ由来のキューに次の項目が残っていれば、続けてそちらを登録する
        const raw = sessionStorage.getItem("scan-prefill-queue");
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { total: number; items: unknown[] };
            const restItems = parsed.items.slice(1);
            if (restItems.length > 0) {
              sessionStorage.setItem(
                "scan-prefill-queue",
                JSON.stringify({ total: parsed.total, items: restItems })
              );
              // 既に /accounts/new にいる場合、router.push だけでは再読み込みされないため
              // 画面を確実に作り直すよう window.location で遷移する
              window.location.href = "/accounts/new";
              return;
            }
            sessionStorage.removeItem("scan-prefill-queue");
          } catch {
            sessionStorage.removeItem("scan-prefill-queue");
          }
        }
        router.push("/");
      }
    } catch (error) {
      console.error(error);
      setErrorMessage("保存に失敗しました。もう一度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!accountId) return;

    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "accounts", accountId));
      router.push("/");
    } catch (error) {
      console.error(error);
      setErrorMessage("削除に失敗しました。もう一度お試しください。");
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  }

  if (isLoading || isFetchingExisting) {
    return <p style={{ fontSize: 14, color: "#999" }}>読み込み中です...</p>;
  }

  return (
    <>
      <form onSubmit={handleSubmit}>
        {!isEditMode && (
          <Link href="/accounts/scan" className="cta-scan">
            <Camera size={18} />
            <span>スクショで登録する</span>
          </Link>
        )}

        {scanProgress && scanProgress.total > 1 && (
          <div
            className="card"
            style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 14, marginBottom: 20 }}
          >
            <Camera size={16} style={{ flexShrink: 0, marginTop: 2, color: "var(--brand)" }} />
            <span>
              スクショから{scanProgress.total}件を検出しました。{scanProgress.current}件目/
              {scanProgress.total}件目の内容を確認して登録してください。
            </span>
          </div>
        )}

        <div className="field">
          <label>名前</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例:PayPay残高"
          />
        </div>

        <div className="field">
          <label>グループ名(任意)</label>
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="例:楽天ポイント"
            list="known-service-names"
          />
          <datalist id="known-service-names">
            {KNOWN_SERVICE_NAMES.map((serviceName) => (
              <option key={serviceName} value={serviceName} />
            ))}
          </datalist>
          <p style={{ fontSize: 13, color: "#999", marginTop: 6 }}>
            サービス名だけを入れてください(例:PayPay)。「残高」「ポイント」などの区別は、上の「名前」欄の方に入れます。同じグループ名を付けておくと、一覧の「サービス別」タブでまとめて表示されます
          </p>
        </div>

        <div className="field">
          <label>種類</label>
          <select value={category} onChange={(e) => handleCategoryChange(e.target.value as AccountCategory)}>
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {isOther && (
          <div className="field">
            <label>種類の名前(自由入力)</label>
            <input
              type="text"
              value={customCategoryLabel}
              onChange={(e) => setCustomCategoryLabel(e.target.value)}
              placeholder="例:友達との貸し借り"
            />
          </div>
        )}

        {(category === "points" || isOther) && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6, color: "#555" }}>
              円建て/非円建て
            </label>
            <div style={{ display: "flex", gap: 16, fontSize: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="radio" checked={isYenBased} onChange={() => setIsYenBased(true)} />
                円建て(1pt=1円など)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="radio" checked={!isYenBased} onChange={() => setIsYenBased(false)} />
                非円建て(マイル等、変動あり)
              </label>
            </div>
          </div>
        )}

        {isOther && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, marginBottom: 6, color: "#555" }}>
              タイプ
            </label>
            <div style={{ display: "flex", gap: 16, fontSize: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input
                  type="radio"
                  checked={accountType === "finite"}
                  onChange={() => setAccountType("finite")}
                />
                完結型(使いきる/失効する)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input
                  type="radio"
                  checked={accountType === "continuous"}
                  onChange={() => setAccountType("continuous")}
                />
                継続型(残高が増減し続ける)
              </label>
            </div>
          </div>
        )}

        {!isStampCard && (
          <div style={{ display: "flex", gap: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>残高</label>
              <input type="number" value={balance} onChange={(e) => setBalance(e.target.value)} />
            </div>
            <div className="field" style={{ width: 96 }}>
              <label>単位</label>
              <input
                type="text"
                value={balanceUnit}
                onChange={(e) => setBalanceUnit(e.target.value)}
                placeholder="円/pt/マイル"
              />
            </div>
          </div>
        )}

        <div className="field">
          <label>有効期限(任意)</label>
          <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          <p style={{ fontSize: 13, color: "#999", marginTop: 6 }}>
            空欄の場合は「期限なし・貯蓄枠」として扱われます
          </p>
        </div>

        <div className="field">
          <label>保管場所メモ(任意)</label>
          <input
            type="text"
            value={storageLocationMemo}
            onChange={(e) => setStorageLocationMemo(e.target.value)}
            placeholder="例:財布/車/引き出し"
          />
        </div>

        <div className="field">
          <label>通知タイミング</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <input
              type="number"
              value={firstStageDays}
              onChange={(e) => setFirstStageDays(Number(e.target.value))}
              style={{ width: 72 }}
            />
            日前 /
            <input
              type="number"
              value={secondStageDays}
              onChange={(e) => setSecondStageDays(Number(e.target.value))}
              style={{ width: 72 }}
            />
            日前
          </div>
        </div>

        {errorMessage && <p style={{ fontSize: 13, color: "#b3261e", marginBottom: 20 }}>{errorMessage}</p>}

        <button type="submit" disabled={isSubmitting || isDeleting} className="btn-primary">
          {isSubmitting ? "保存中..." : isEditMode ? "更新する" : "登録する"}
        </button>

        {isEditMode && (
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            disabled={isSubmitting || isDeleting}
            className="btn-danger"
            style={{ marginTop: 12 }}
          >
            この口座を削除する
          </button>
        )}
      </form>

      {showDeleteModal && (
        <div className="modal-backdrop">
          <div className="modal-sheet">
            <p>「{name || "この口座"}」を削除します。よろしいですか?</p>
            <div className="modal-actions">
              <button className="btn-danger" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? "削除中..." : "削除する"}
              </button>
              <button className="btn-ghost" onClick={() => setShowDeleteModal(false)} disabled={isDeleting}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
