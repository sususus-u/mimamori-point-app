"use client";

// 現物(切手・紙の商品券など)を撮影して登録・更新する画面。
// 誤読リスクが高いため、既存口座と一致する場合も、初めての場合も、必ずこの画面内で
// 内容を確認・修正してから、本人の操作(保存ボタン)で保存する。自動保存はしない。

import { useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthProvider";

interface ScanResult {
  name: string | null;
  itemCount: number | null;
  totalAmount: number | null;
  faceValuePerItem: number | null;
  expiryDate: string | null;
}

export default function ScanPhysicalUpload() {
  const router = useRouter();
  const { uid } = useAuth();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // 確認フォームの状態
  const [matchedAccountId, setMatchedAccountId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [unitAmount, setUnitAmount] = useState("");
  const [quantity, setQuantity] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [itemCount, setItemCount] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [nameUnrecognized, setNameUnrecognized] = useState(false);

  // スクショ登録フォームからカメラを直接起動した場合、撮影した画像がsessionStorage経由で
  // 渡ってくる。マウント時に一度だけ確認し、あれば自動で読み取り処理を始める。
  useEffect(() => {
    const raw = sessionStorage.getItem("physical-scan-pending-image");
    if (!raw) return;
    sessionStorage.removeItem("physical-scan-pending-image");

    try {
      const { base64, mediaType } = JSON.parse(raw) as { base64: string; mediaType: string };
      setPreviewUrl(`data:${mediaType};base64,${base64}`);
      processImage(base64, mediaType);
    } catch (error) {
      console.error(error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function processImage(base64: string, mediaType: string) {
    if (!uid) return;

    setErrorMessage("");
    setSavedMessage("");
    setIsProcessing(true);
    setMatchedAccountId(null);

    try {
      const res = await fetch("/api/scan-physical-count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      const data: ScanResult = await res.json();

      if (!res.ok) {
        throw new Error("読み取りに失敗しました");
      }

      setName(data.name ?? "");
      setNameUnrecognized(!data.name);
      setTotalAmount(data.totalAmount !== null ? String(data.totalAmount) : "");
      setUnitAmount(data.faceValuePerItem !== null ? String(data.faceValuePerItem) : "");
      setQuantity(data.itemCount !== null ? String(data.itemCount) : "");
      setExpiryDate(data.expiryDate ?? "");
      setItemCount(data.itemCount);

      // 同じ名前の既存口座があるか確認(あれば比較しながら更新できるようにする)
      if (data.name) {
        const q = query(
          collection(db, "accounts"),
          where("ownerId", "==", uid),
          where("name", "==", data.name)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          setMatchedAccountId(snapshot.docs[0].id);
        }
      }
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : "読み取りに失敗しました");
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uid) return;

    setPreviewUrl(URL.createObjectURL(file));
    const base64 = await fileToBase64(file);
    await processImage(base64, file.type);
  }

  function handleApplyUnitCalc() {
    const unit = Number(unitAmount);
    const qty = Number(quantity);
    if (unitAmount === "" || quantity === "" || isNaN(unit) || isNaN(qty)) return;
    setTotalAmount(String(unit * qty));
  }

  async function handleSave() {
    if (!uid || !name.trim()) {
      setErrorMessage("名前を入力してください。");
      return;
    }
    if (unitAmount === "" || quantity === "") {
      setErrorMessage("額面と枚数を入力してください。");
      return;
    }
    setIsSaving(true);
    setErrorMessage("");

    try {
      const now = serverTimestamp();
      const balanceValue = totalAmount === "" ? null : Number(totalAmount);
      const expiryValue = expiryDate ? Timestamp.fromDate(new Date(expiryDate)) : null;

      if (matchedAccountId) {
        await updateDoc(doc(db, "accounts", matchedAccountId), {
          currentBalance: balanceValue,
          balanceUnit: "円",
          expiryDate: expiryValue,
          faceValue: unitAmount === "" ? null : Number(unitAmount),
          itemQuantity: quantity === "" ? null : Number(quantity),
          lastUpdatedAt: now,
          updatedAt: now,
        });
      } else {
        await addDoc(collection(db, "accounts"), {
          ownerId: uid,
          name: name.trim(),
          groupName: name.trim(),
          category: "gift_certificate",
          isYenBased: true,
          type: "finite",
          currentBalance: balanceValue,
          balanceUnit: "円",
          expiryDate: expiryValue,
          faceValue: unitAmount === "" ? null : Number(unitAmount),
          itemQuantity: quantity === "" ? null : Number(quantity),
          storageLocationMemo: null,
          notificationTiming: { firstStageDays: 90, secondStageDays: 21 },
          lastUpdatedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      }

      setSavedMessage(`「${name}」を保存しました`);
      setTimeout(() => router.push("/"), 800);
    } catch (error) {
      console.error(error);
      setErrorMessage("保存に失敗しました。もう一度お試しください。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>
        切手や紙の商品券など、現物を並べて撮影してください。枚数・額面をAIが数えて合計金額を算出します。
      </p>
      <p style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>
        読み取り精度が写真の状態に左右されやすいため、保存前に必ず内容を確認してください。
      </p>
      <p style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>
        明るい場所で、正面からピントを合わせて撮ると読み取り精度が上がります。
      </p>

      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        disabled={isProcessing}
        style={{ width: "100%", fontSize: 14, marginBottom: 16 }}
      />

      {previewUrl && (
        <div className="card" style={{ marginBottom: 16, padding: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="選択した画像のプレビュー"
            style={{ width: "100%", maxHeight: 240, objectFit: "contain" }}
          />
        </div>
      )}

      {isProcessing && <p style={{ fontSize: 13, color: "#999" }}>画像を読み取っています...</p>}
      {errorMessage && <p style={{ fontSize: 13, color: "#b3261e" }}>{errorMessage}</p>}
      {savedMessage && <p style={{ fontSize: 13, color: "#2a7a3b" }}>{savedMessage}</p>}

      {!isProcessing && (name || totalAmount) && (
        <div className="card" style={{ marginTop: 8 }}>
          {matchedAccountId && (
            <p style={{ fontSize: 12, color: "var(--brand)", marginBottom: 12 }}>
              既存のサービスと同じ名前です。内容を確認して更新してください。
            </p>
          )}
          {itemCount !== null && (
            <p style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>読み取った枚数:{itemCount}枚</p>
          )}

          <div className="field">
            <label>名前</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例:切手、図書カード"
            />
            {nameUnrecognized && (
              <p style={{ fontSize: 12, color: "#b3261e" }}>
                文字を読み取れませんでした。手入力してください
              </p>
            )}
          </div>

          <div className="field">
            <label>額面 × 枚数</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="number"
                value={unitAmount}
                onChange={(e) => setUnitAmount(e.target.value)}
                placeholder="額面(1枚あたり)"
                style={{ flex: 1 }}
              />
              <span style={{ color: "#999" }}>×</span>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="枚数"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={handleApplyUnitCalc}
                style={{
                  flexShrink: 0,
                  padding: "10px 14px",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--brand)",
                  background: "#fff",
                  border: "1px solid var(--brand)",
                  borderRadius: "var(--radius-pill)",
                  whiteSpace: "nowrap",
                }}
              >
                反映
              </button>
            </div>
            <p style={{ fontSize: 12, color: "#999", marginTop: 6 }}>
              同じ額面のものが複数ある場合、まとめて入力できます
            </p>
            <p style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
              切手など重なって見えるものは、枚数を多く数えてしまうことがあります。実際の枚数に修正してください。
            </p>
            {itemCount === 1 && (
              <p style={{ fontSize: 12, color: "var(--brand)", marginTop: 4 }}>
                1枚だけ撮影した場合の初期値です。実際にお持ちの枚数に変更すると合計金額を計算できます
              </p>
            )}
          </div>

          <div className="field">
            <label>合計金額(円)</label>
            <input
              type="number"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
            />
          </div>

          <div className="field">
            <label>有効期限(任意)</label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn-primary"
            style={{ width: "100%" }}
          >
            {isSaving ? "保存中..." : matchedAccountId ? "この内容で更新する" : "この内容で登録する"}
          </button>
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
