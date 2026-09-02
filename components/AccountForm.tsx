"use client";

// 口座登録・編集フォーム。
// accountId が渡されると編集モードになり、既存データを読み込んで更新・削除ができる。
// 種類を選ぶと、CATEGORY_DEFAULTS から円建てフラグ・タイプ・通知タイミングの
// 初期値が自動で入る。ポイント・その他は円建て/非円建てをユーザーが選び直せる。

import { useState, useEffect, useRef, type FormEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera } from "lucide-react";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { guessServiceInfo } from "@/lib/knownServices";
import { useAuth } from "@/contexts/AuthProvider";
import {
  CATEGORY_DEFAULTS,
  type AccountCategory,
  type AccountType,
  type AccountDoc,
  type OutcomeEventType,
} from "@/types/firestore";

const CATEGORY_OPTIONS: { value: AccountCategory; label: string }[] = [
  { value: "electronic_money", label: "電子マネー" },
  { value: "points", label: "ポイント" },
  { value: "gift_certificate", label: "商品券・切手" },
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

// グループ名(サービス名)ごとの、口座名(名前欄)の候補バリエーション。
// Pay系は「残高」「ポイント」の2種類が並存するため候補を複数用意し、それ以外は1種類のみ
const SERVICE_ACCOUNT_NAME_VARIANTS: Record<string, string[]> = {
  "PayPay": ["PayPay残高", "PayPayポイント", "PayPayポイント(期限あり)"],
  "au PAY": ["au PAY残高", "au PAYポイント", "au PAYポイント(期限あり)"],
  "楽天ポイント": ["楽天ポイント", "楽天ポイント(期間限定)"],
  "dポイント": ["dポイント", "dポイント(期間限定)"],
  "Pontaポイント": ["Pontaポイント", "Pontaポイント(期間限定)"],
  "Vポイント": ["Vポイント", "Vポイント(期間限定)"],
  "WAON": ["WAON"],
  "nanaco": ["nanaco"],
  "Suica": ["Suica"],
  "PASMO": ["PASMO"],
  "Amazonギフト券": ["Amazonギフト券"],
  "図書カード": ["図書カード"],
  "ANAマイレージクラブ": ["ANAマイレージクラブ"],
  "JALマイレージバンク": ["JALマイレージバンク"],
};

// グループ名が候補にない場合、名前欄の候補として出す全サービスの口座名一覧
const KNOWN_ACCOUNT_NAMES = Object.values(SERVICE_ACCOUNT_NAME_VARIANTS).flat();

export default function AccountForm({ accountId }: { accountId?: string }) {
  const router = useRouter();
  const { uid, isLoading } = useAuth();
  const isEditMode = Boolean(accountId);
  const physicalFileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [category, setCategory] = useState<AccountCategory>("electronic_money");
  const [customCategoryLabel, setCustomCategoryLabel] = useState("");
  const [isYenBased, setIsYenBased] = useState(CATEGORY_DEFAULTS.electronic_money.isYenBased);
  const [accountType, setAccountType] = useState<AccountType>(CATEGORY_DEFAULTS.electronic_money.type);
  const [balance, setBalance] = useState("");
  const [balanceUnit, setBalanceUnit] = useState("円");
  const [faceValue, setFaceValue] = useState("");
  const [itemQuantity, setItemQuantity] = useState("");
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
  const [pendingOutcome, setPendingOutcome] = useState<OutcomeEventType | null>(null);
  const [isRecordingOutcome, setIsRecordingOutcome] = useState(false);
  // スクショ読み取りの確信度が低かった項目(true の場合、枠色と注意文で強調する)
  const [balanceLowConfidence, setBalanceLowConfidence] = useState(false);
  const [expiryLowConfidence, setExpiryLowConfidence] = useState(false);
  // 新規登録時、名前欄からフォーカスが外れた際に同名の既存サービスが見つかった場合の情報
  const [duplicateAccount, setDuplicateAccount] = useState<{
    id: string;
    currentBalance: number | null;
    type: AccountType;
    faceValue: number | null;
    itemQuantity: number | null;
  } | null>(null);

  const isStampCard = category === "stamp_card";
  const isOther = category === "other";
  const isGiftCertificate = category === "gift_certificate";

  // グループ名に応じた名前欄の候補(該当サービスがなければ全サービスの一覧にフォールバック)
  const nameCandidates = SERVICE_ACCOUNT_NAME_VARIANTS[groupName.trim()] ?? KNOWN_ACCOUNT_NAMES;

  // グループ名の候補が1つだけに定まる場合、名前が未入力なら自動でセットする
  useEffect(() => {
    const variants = SERVICE_ACCOUNT_NAME_VARIANTS[groupName.trim()];
    if (variants && variants.length === 1 && name === "") {
      setName(variants[0]);
    }
  }, [groupName]);

  // 商品券・ギフトカードの場合、残高は額面×枚数から自動計算する(手入力させない)
  useEffect(() => {
    if (category !== "gift_certificate") return;
    if (faceValue === "" || itemQuantity === "") return;
    const fv = Number(faceValue);
    const qty = Number(itemQuantity);
    if (Number.isNaN(fv) || Number.isNaN(qty)) return;
    setBalance(String(fv * qty));
  }, [faceValue, itemQuantity, category]);

  // 名前欄が既知の口座名候補と完全一致した場合(候補から選んだ・自動入力された場合)、
  // その名前から種類・円建てフラグを推測して連動させる
  useEffect(() => {
    if (!KNOWN_ACCOUNT_NAMES.includes(name)) return;
    const info = guessServiceInfo(name, null);
    setCategory(info.category);
    const defaults = CATEGORY_DEFAULTS[info.category];
    setIsYenBased(info.isYenBased);
    setAccountType(defaults.type);
    setFirstStageDays(defaults.notificationDaysBefore[0]);
    setSecondStageDays(defaults.notificationDaysBefore[1]);
  }, [name]);

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
        if (data.faceValue !== undefined && data.faceValue !== null) {
          setFaceValue(String(data.faceValue));
        }
        if (data.itemQuantity !== undefined && data.itemQuantity !== null) {
          setItemQuantity(String(data.itemQuantity));
        }
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
          balanceLowConfidence?: boolean;
          expiryLowConfidence?: boolean;
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
      setBalanceLowConfidence(Boolean(data.balanceLowConfidence));
      setExpiryLowConfidence(Boolean(data.expiryLowConfidence));
    } catch (error) {
      console.error(error);
    }
  }, [accountId]);

  async function handlePhysicalCapture(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const base64 = await fileToBase64(file);
    sessionStorage.setItem(
      "physical-scan-pending-image",
      JSON.stringify({ base64, mediaType: file.type })
    );
    router.push("/accounts/scan-physical");
  }

  // 新規登録時のみ、名前欄からフォーカスが外れたタイミングで同名の既存サービスを検索する
  async function handleNameBlur() {
    if (isEditMode || !uid || !name.trim()) return;
    try {
      const q = query(
        collection(db, "accounts"),
        where("ownerId", "==", uid),
        where("name", "==", name.trim())
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setDuplicateAccount(null);
        return;
      }
      const existing = snap.docs[0];
      const data = existing.data() as AccountDoc;
      setDuplicateAccount({
        id: existing.id,
        currentBalance: data.currentBalance ?? null,
        type: data.type,
        faceValue: data.faceValue ?? null,
        itemQuantity: data.itemQuantity ?? null,
      });
    } catch (error) {
      console.error(error);
    }
  }

  function handleCategoryChange(newCategory: AccountCategory) {
    setCategory(newCategory);
    const defaults = CATEGORY_DEFAULTS[newCategory];
    setIsYenBased(defaults.isYenBased);
    setAccountType(defaults.type);
    setFirstStageDays(defaults.notificationDaysBefore[0]);
    setSecondStageDays(defaults.notificationDaysBefore[1]);
    setBalanceUnit(defaults.isYenBased ? "円" : "");
  }

  // 登録・置き換え・追加のいずれでも使う入力チェック。エラーがあれば errorMessage をセットして false を返す
  function validateForm(): boolean {
    if (!uid) {
      setErrorMessage("ログイン処理が完了していません。少し待ってからもう一度お試しください。");
      return false;
    }
    if (!name.trim()) {
      setErrorMessage("名前を入力してください。");
      return false;
    }
    if (isOther && !customCategoryLabel.trim()) {
      setErrorMessage("「その他」を選んだ場合は、種類の名前を入力してください。");
      return false;
    }
    if (isGiftCertificate && (faceValue === "" || itemQuantity === "")) {
      setErrorMessage("額面と枚数を入力してください。");
      return false;
    }
    return true;
  }

  // 今のフォーム入力から、accounts ドキュメントのペイロードと updates サブコレクション用レコードを組み立てる
  function buildPayloadAndUpdateRecord() {
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
            faceValue: faceValue === "" ? null : Number(faceValue),
            itemQuantity: itemQuantity === "" ? null : Number(itemQuantity),
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

    const updateRecord = {
      recordedAt: now,
      balance: balance === "" ? null : Number(balance),
      expiryDate: expiryDate ? Timestamp.fromDate(new Date(expiryDate)) : null,
      source: "manual" as const,
      confirmedByUser: true,
    };

    return { now, payload, updateRecord };
  }

  // 重複が見つからなかった場合、および「新たに登録する」を選んだ場合の処理
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage("");
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const { now, payload, updateRecord } = buildPayloadAndUpdateRecord();

      if (isEditMode && accountId) {
        await updateDoc(doc(db, "accounts", accountId), payload);
        await addDoc(collection(db, "accounts", accountId, "updates"), updateRecord);
        router.push("/");
      } else {
        const docRef = await addDoc(collection(db, "accounts"), { ...payload, createdAt: now });
        await addDoc(collection(db, "accounts", docRef.id, "updates"), updateRecord);

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

  // 「置き換える」: 見つかった既存口座を、今のフォーム入力で上書きする
  async function handleReplaceExisting() {
    setErrorMessage("");
    if (!validateForm()) return;
    if (!duplicateAccount) return;

    setIsSubmitting(true);
    try {
      const { payload, updateRecord } = buildPayloadAndUpdateRecord();
      await updateDoc(doc(db, "accounts", duplicateAccount.id), payload);
      await addDoc(collection(db, "accounts", duplicateAccount.id, "updates"), updateRecord);
      router.push("/");
    } catch (error) {
      console.error(error);
      setErrorMessage("保存に失敗しました。もう一度お試しください。");
    } finally {
      setIsSubmitting(false);
    }
  }

  // 「今回の分を追加する」: 見つかった既存口座の残高・額面・枚数に、今回の入力値を加算する
  async function handleAddToExisting() {
    setErrorMessage("");
    if (!validateForm()) return;
    if (!duplicateAccount) return;

    setIsSubmitting(true);
    try {
      const now = serverTimestamp();
      const newBalance = (duplicateAccount.currentBalance ?? 0) + (balance === "" ? 0 : Number(balance));
      // 額面は1枚あたりの単価なので加算せず、今回入力した値で上書きする
      const newFaceValue = faceValue === "" ? duplicateAccount.faceValue ?? 0 : Number(faceValue);
      const newItemQuantity =
        (duplicateAccount.itemQuantity ?? 0) + (itemQuantity === "" ? 0 : Number(itemQuantity));

      await updateDoc(doc(db, "accounts", duplicateAccount.id), {
        currentBalance: newBalance,
        faceValue: newFaceValue,
        itemQuantity: newItemQuantity,
        lastUpdatedAt: now,
        updatedAt: now,
      });
      await addDoc(collection(db, "accounts", duplicateAccount.id, "updates"), {
        recordedAt: now,
        balance: newBalance,
        expiryDate: expiryDate ? Timestamp.fromDate(new Date(expiryDate)) : null,
        source: "manual" as const,
        confirmedByUser: true,
      });
      router.push("/");
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

  async function handleOutcome(eventType: OutcomeEventType) {
    if (!accountId || !uid) return;

    setIsRecordingOutcome(true);
    try {
      await addDoc(collection(db, "outcome_events"), {
        ownerId: uid,
        accountId,
        accountName: name,
        category,
        eventType,
        eventDate: serverTimestamp(),
        ...(isYenBased && balance !== "" ? { amount: Number(balance) } : {}),
        isYenBased,
        createdAt: serverTimestamp(),
      });

      if (accountType === "finite") {
        await deleteDoc(doc(db, "accounts", accountId));
      } else {
        await updateDoc(doc(db, "accounts", accountId), {
          currentBalance: 0,
          expiryDate: null,
          lastUpdatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      router.push("/");
    } catch (error) {
      console.error(error);
      setErrorMessage("記録に失敗しました。もう一度お試しください。");
      setIsRecordingOutcome(false);
      setPendingOutcome(null);
    }
  }

  if (isLoading || isFetchingExisting) {
    return <p style={{ fontSize: 14, color: "#999" }}>読み込み中です...</p>;
  }

  return (
    <>
      <form onSubmit={handleSubmit}>
        {!isEditMode && (
          <>
            <Link href="/accounts/scan" className="btn-primary" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
              画面のスクショで登録
            </Link>
            <button
              type="button"
              onClick={() => physicalFileInputRef.current?.click()}
              className="btn-primary"
              style={{ display: "block", width: "100%", textAlign: "center", marginTop: 12, background: "#8a5a62" }}
            >
              現物を撮影して登録
            </button>
            <input
              ref={physicalFileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhysicalCapture}
              style={{ display: "none" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
              <div style={{ flex: 1, height: 1, background: "#eee" }} />
              <span style={{ fontSize: 12, color: "#999" }}>または、直接入力する</span>
              <div style={{ flex: 1, height: 1, background: "#eee" }} />
            </div>
          </>
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
          <label>グループ名(任意)</label>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="例:楽天ポイント"
              list="known-service-names"
              style={{ paddingRight: groupName ? 32 : undefined }}
            />
            {groupName && (
              <button
                type="button"
                onClick={() => setGroupName("")}
                aria-label="グループ名をクリア"
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "none",
                  color: "#999",
                  fontSize: 16,
                  cursor: "pointer",
                  padding: 4,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            )}
          </div>
          <datalist id="known-service-names">
            {KNOWN_SERVICE_NAMES.map((serviceName) => (
              <option key={serviceName} value={serviceName} />
            ))}
          </datalist>
          <p style={{ fontSize: 13, color: "#999", marginTop: 6 }}>
            サービス名だけを入れてください(例:PayPay)。「残高」「ポイント」などの区別は、下の「名前」欄の方に入れます。同じグループ名を付けておくと、一覧の「サービス別」タブでまとめて表示されます
          </p>
        </div>

        <div className="field">
          <label>名前</label>
          <div style={{ position: "relative" }}>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDuplicateAccount(null);
              }}
              onBlur={handleNameBlur}
              placeholder="例:PayPay残高"
              list="known-account-names"
              style={{ paddingRight: name ? 32 : undefined }}
            />
            {name && (
              <button
                type="button"
                onClick={() => {
                  setName("");
                  setDuplicateAccount(null);
                }}
                aria-label="名前をクリア"
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "none",
                  color: "#999",
                  fontSize: 16,
                  cursor: "pointer",
                  padding: 4,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            )}
          </div>
          <datalist id="known-account-names">
            {nameCandidates.map((candidateName) => (
              <option key={candidateName} value={candidateName} />
            ))}
          </datalist>
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

        {!isStampCard && !isGiftCertificate && (
          <div style={{ display: "flex", gap: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>残高</label>
              <input
                type="number"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                style={balanceLowConfidence ? { borderColor: "#b56a1e", background: "#fdf3e7" } : undefined}
              />
              {balanceLowConfidence && (
                <p style={{ fontSize: 12, color: "#b56a1e", marginTop: 4 }}>
                  読み取りに自信が持てませんでした。確認してください
                </p>
              )}
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

        {isGiftCertificate && (
          <div style={{ display: "flex", gap: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>額面</label>
              <div style={{ position: "relative" }}>
                <input
                  type="number"
                  value={faceValue}
                  onChange={(e) => setFaceValue(e.target.value)}
                  placeholder="1枚あたり"
                  style={{ paddingRight: 32 }}
                />
                <span
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: 13,
                    color: "#999",
                  }}
                >
                  円
                </span>
              </div>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>枚数</label>
              <div style={{ position: "relative" }}>
                <input
                  type="number"
                  value={itemQuantity}
                  onChange={(e) => setItemQuantity(e.target.value)}
                  placeholder="枚数"
                  style={{ paddingRight: 32 }}
                />
                <span
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: 13,
                    color: "#999",
                  }}
                >
                  枚
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="field">
          <label>有効期限(任意)</label>
          <input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            style={expiryLowConfidence ? { borderColor: "#b56a1e", background: "#fdf3e7" } : undefined}
          />
          {expiryLowConfidence && (
            <p style={{ fontSize: 12, color: "#b56a1e", marginTop: 4 }}>
              読み取りに自信が持てませんでした。確認してください
            </p>
          )}
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

        {!isEditMode && duplicateAccount ? (
          <>
            <p style={{ fontSize: 13, color: "#555", marginBottom: 12 }}>
              同じ名前のサービスが既にあります。現在の残高:¥{duplicateAccount.currentBalance ?? 0}
              {duplicateAccount.itemQuantity !== null && duplicateAccount.itemQuantity !== undefined && (
                <>(枚数:{duplicateAccount.itemQuantity}枚)</>
              )}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                onClick={handleReplaceExisting}
                disabled={isSubmitting || isDeleting}
                className="btn-primary"
              >
                {isSubmitting ? "保存中..." : "置き換える"}
              </button>
              {duplicateAccount.type === "finite" && (
                <button
                  type="button"
                  onClick={handleAddToExisting}
                  disabled={isSubmitting || isDeleting}
                  className="btn-primary"
                >
                  {isSubmitting ? "保存中..." : "今回の分を追加する"}
                </button>
              )}
              <button type="submit" disabled={isSubmitting || isDeleting} className="btn-primary">
                {isSubmitting ? "保存中..." : "新たに登録する"}
              </button>
            </div>
          </>
        ) : (
          <button type="submit" disabled={isSubmitting || isDeleting} className="btn-primary">
            {isSubmitting ? "保存中..." : isEditMode ? "更新する" : "登録する"}
          </button>
        )}

        {isEditMode && (
          <div className="action-row" style={{ marginTop: 12 }}>
            {accountType === "finite" && (
              <button
                type="button"
                onClick={() => setPendingOutcome("used_up")}
                disabled={isSubmitting || isDeleting}
                className="btn-outline"
              >
                使いきった
              </button>
            )}
            <button
              type="button"
              onClick={() => setPendingOutcome("expired")}
              disabled={isSubmitting || isDeleting}
              className="btn-outline-warm"
            >
              失効した
            </button>
          </div>
        )}

        {isEditMode && (
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            disabled={isSubmitting || isDeleting}
            className="btn-danger"
            style={{ marginTop: 12 }}
          >
            このサービスを削除する
          </button>
        )}
      </form>

      {showDeleteModal && (
        <div className="modal-backdrop">
          <div className="modal-sheet">
            <p>「{name || "このサービス"}」を削除します。よろしいですか?</p>
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

      {pendingOutcome && (
        <div className="modal-backdrop">
          <div className="modal-sheet">
            <p>
              {accountType === "continuous" ? (
                <>「{name || "このサービス"}」の失効を記録します。残高は0にリセットされます。よろしいですか?</>
              ) : (
                <>
                  「{name || "このサービス"}」を{pendingOutcome === "used_up" ? "使いきった" : "失効した"}記録を残します。よろしいですか?
                </>
              )}
            </p>
            <div className="modal-actions">
              <button
                className={pendingOutcome === "used_up" ? "btn-outline" : "btn-outline-warm"}
                onClick={() => handleOutcome(pendingOutcome)}
                disabled={isRecordingOutcome}
              >
                {isRecordingOutcome ? "記録中..." : "記録する"}
              </button>
              <button
                className="btn-ghost"
                onClick={() => setPendingOutcome(null)}
                disabled={isRecordingOutcome}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </>
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
