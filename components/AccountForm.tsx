"use client";

// 口座登録フォーム。
// 種類を選ぶと、CATEGORY_DEFAULTS から円建てフラグ・タイプ・通知タイミングの
// 初期値が自動で入る。ポイント・その他は円建て/非円建てをユーザーが選び直せる。

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthProvider";
import { CATEGORY_DEFAULTS, type AccountCategory, type AccountType } from "@/types/firestore";

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

export default function AccountForm() {
  const router = useRouter();
  const { uid, isLoading } = useAuth();

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
  const [errorMessage, setErrorMessage] = useState("");

  const isStampCard = category === "stamp_card";
  const isOther = category === "other";

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
      await addDoc(collection(db, "accounts"), {
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
        createdAt: now,
        updatedAt: now,
      });

      router.push("/");
    } catch (error) {
      console.error(error);
      setErrorMessage("保存に失敗しました。もう一度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <p className="p-6 text-sm text-gray-500">読み込み中です...</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto p-6 space-y-5">
      <h1 className="text-lg font-semibold">口座を登録</h1>

      <div>
        <label className="block text-sm font-medium mb-1">名前</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例:PayPay残高"
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">グループ名(任意)</label>
        <input
          type="text"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="例:楽天ポイント"
          list="known-service-names"
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
        <datalist id="known-service-names">
          {KNOWN_SERVICE_NAMES.map((serviceName) => (
            <option key={serviceName} value={serviceName} />
          ))}
        </datalist>
        <p className="text-xs text-gray-500 mt-1">
          サービス名だけを入れてください(例:PayPay)。「残高」「ポイント」などの区別は、上の「名前」欄の方に入れます。同じグループ名を付けておくと、一覧の「サービス別」タブでまとめて表示されます
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">種類</label>
        <select
          value={category}
          onChange={(e) => handleCategoryChange(e.target.value as AccountCategory)}
          className="w-full border rounded-md px-3 py-2 text-sm bg-white"
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {isOther && (
        <div>
          <label className="block text-sm font-medium mb-1">種類の名前(自由入力)</label>
          <input
            type="text"
            value={customCategoryLabel}
            onChange={(e) => setCustomCategoryLabel(e.target.value)}
            placeholder="例:友達との貸し借り"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>
      )}

      {(category === "points" || isOther) && (
        <div>
          <label className="block text-sm font-medium mb-1">円建て/非円建て</label>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input type="radio" checked={isYenBased} onChange={() => setIsYenBased(true)} />
              円建て(1pt=1円など)
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={!isYenBased} onChange={() => setIsYenBased(false)} />
              非円建て(マイル等、変動あり)
            </label>
          </div>
        </div>
      )}

      {isOther && (
        <div>
          <label className="block text-sm font-medium mb-1">タイプ</label>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={accountType === "finite"}
                onChange={() => setAccountType("finite")}
              />
              完結型(使いきる/失効する)
            </label>
            <label className="flex items-center gap-1">
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
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">残高</label>
            <input
              type="number"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div className="w-24">
            <label className="block text-sm font-medium mb-1">単位</label>
            <input
              type="text"
              value={balanceUnit}
              onChange={(e) => setBalanceUnit(e.target.value)}
              placeholder="円/pt/マイル"
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">有効期限(任意)</label>
        <input
          type="date"
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
        <p className="text-xs text-gray-500 mt-1">空欄の場合は「期限なし・貯蓄枠」として扱われます</p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">保管場所メモ(任意)</label>
        <input
          type="text"
          value={storageLocationMemo}
          onChange={(e) => setStorageLocationMemo(e.target.value)}
          placeholder="例:財布/車/引き出し"
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">通知タイミング</label>
        <div className="flex gap-3 items-center text-sm">
          <input
            type="number"
            value={firstStageDays}
            onChange={(e) => setFirstStageDays(Number(e.target.value))}
            className="w-20 border rounded-md px-2 py-1"
          />
          日前 /
          <input
            type="number"
            value={secondStageDays}
            onChange={(e) => setSecondStageDays(Number(e.target.value))}
            className="w-20 border rounded-md px-2 py-1"
          />
          日前
        </div>
      </div>

      {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-gray-900 text-white rounded-md py-2 text-sm font-medium disabled:opacity-50"
      >
        {isSubmitting ? "保存中..." : "登録する"}
      </button>
    </form>
  );
}
