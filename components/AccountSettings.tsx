"use client";

// メニュー画面「設定」→「アカウント」の表示名入力欄。
// 表示名は、共有機能(まだ未実装)が将来追加された時に使う土台として、
// 先に用意しておくもの。現時点では実際には使われない。
//
// まもりびよりの招待承認画面と同じ考え方:
// - このアプリのFirestore(users/{uid}.displayName)に、すでに値があればそれを使う
// - 無ければ、ハブに登録されているユーザー名を初期値の候補として表示する
//   (この時点ではまだ保存しない。保存するのは、利用者が「保存」を押した時だけ)

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthProvider";

export default function AccountSettings() {
  const { uid } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    (async () => {
      const snap = await getDoc(doc(db, "users", uid));
      const existing = snap.exists()
        ? (snap.data().displayName as string | undefined)
        : undefined;
      if (cancelled) return;
      if (existing) {
        setDisplayName(existing);
        setLoaded(true);
        return;
      }
      try {
        const res = await fetch(`/api/user-name?uid=${encodeURIComponent(uid)}`);
        const data = await res.json();
        if (!cancelled && data.name) setDisplayName(data.name);
      } catch {
        // 取得に失敗しても、空欄のままにする
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  async function handleSave() {
    if (!uid || saving) return;
    const trimmed = displayName.trim();
    setSaving(true);
    setMessage(null);
    try {
      await setDoc(doc(db, "users", uid), { displayName: trimmed }, { merge: true });
      setMessage("保存しました");
    } catch {
      setMessage("保存に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p style={{ fontSize: 12, color: "#999", lineHeight: 1.6, marginBottom: 10 }}>
        表示名は、共有機能などであなたを示すために使う名前です(現在は未使用)。
        ログイン状態は「きづきびより ハブ」と共通です。
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="表示名"
          disabled={!uid || !loaded}
          style={{
            flex: 1,
            minWidth: 0,
            border: "1px solid #ddd",
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 14,
            fontFamily: "inherit",
          }}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={!uid || saving}
          style={{
            flexShrink: 0,
            background: "#fff",
            color: "var(--brand)",
            border: "1px solid var(--brand)",
            borderRadius: 100,
            padding: "0 16px",
            fontSize: 13,
            fontWeight: 500,
            opacity: !uid || saving ? 0.5 : 1,
          }}
        >
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
      {message && <p style={{ fontSize: 12, color: "#777", marginTop: 6 }}>{message}</p>}
    </div>
  );
}
