"use client";

// スクショアップロード画面。
// 1) 画像を選ぶ → 2) サーバーでAIが読み取り → 3a) 同名口座があれば確認なしで自動更新
// 3b) 初めてのサービスなら、内容を事前入力した登録フォームへ遷移(初回のみ確認)。

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb } from "lucide-react";
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthProvider";
import { guessServiceInfo } from "@/lib/knownServices";

interface PrefillItem {
  name: string;
  groupName: string;
  category: string;
  isYenBased: boolean;
  balance: number | string;
  balanceUnit: string;
  expiryDate: string;
}

export default function ScanUpload() {
  const router = useRouter();
  const { uid } = useAuth();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uid) return;

    setErrorMessage("");
    setStatusMessage("");
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
      const balanceUnit: string | null = data.balanceUnit;
      const expiryDate: string | null = data.expiryDate;
      const limitedPortion: { balance: number; expiryDate: string | null } | null =
        data.limitedPortion;

      if (!serviceName) {
        setErrorMessage("サービス名を読み取れませんでした。手入力で登録してください。");
        setIsProcessing(false);
        return;
      }

      setStatusMessage("既存の口座を確認しています...");

      // 内訳(期間・用途限定ポイント等)が見つかった場合は、通常分/限定分の2口座に分けて扱う
      const targets = limitedPortion
        ? [
            {
              name: `${serviceName}(通常)`,
              balance:
                totalBalance !== null ? totalBalance - limitedPortion.balance : null,
              expiryDate,
            },
            {
              name: `${serviceName}(期間・用途限定)`,
              balance: limitedPortion.balance,
              expiryDate: limitedPortion.expiryDate,
            },
          ]
        : [{ name: serviceName, balance: totalBalance, expiryDate }];

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
          await updateDoc(doc(db, "accounts", existing.id), {
            currentBalance: target.balance ?? null,
            balanceUnit: balanceUnit ?? existing.data().balanceUnit ?? null,
            expiryDate: target.expiryDate ? Timestamp.fromDate(new Date(target.expiryDate)) : null,
            lastUpdatedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          const guess = guessServiceInfo(serviceName, balanceUnit);
          queueItems.push({
            name: target.name,
            groupName: serviceName,
            category: guess.category,
            isYenBased: guess.isYenBased,
            balance: target.balance ?? "",
            balanceUnit: balanceUnit ?? (guess.isYenBased ? "円" : ""),
            expiryDate: target.expiryDate ?? "",
          });
        }
      }

      if (queueItems.length === 0) {
        setStatusMessage(`「${serviceName}」を更新しました`);
        setTimeout(() => router.push("/"), 800);
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

  return (
    <div>
      <p style={{ fontSize: 13, color: "#999" }}>
        残高・期限が写ったスクリーンショットを選んでください。同じ名前の口座がすでにあれば自動で更新し、初めてのサービスなら内容確認画面に進みます。
      </p>
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
      {errorMessage && <p style={{ fontSize: 13, color: "#b3261e" }}>{errorMessage}</p>}
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
