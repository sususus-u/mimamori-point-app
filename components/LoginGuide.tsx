"use client";

// ハブにログインしていないときに出す案内の画面。
// 出すのは、ブランド名・「ハブでログインする」ボタン・規約とプライバシーポリシーへのリンクだけ。
// ハブへは自動では移動せず、必ずボタンを押してもらう。

import { useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { goToHubLogin } from "@/lib/hubLogin";

const HUB_TERMS_URL = "https://okizukibiyori.com/terms#たまりびより";
const HUB_PRIVACY_URL = "https://okizukibiyori.com/privacy#たまりびより";

export default function LoginGuide() {
  const { handoffFailed } = useAuth();
  const [blocked, setBlocked] = useState(false);

  function handleLogin() {
    // 移動できなかった(この起動ですでに1回移動している)ときは、メッセージを出す
    if (!goToHubLogin()) setBlocked(true);
  }

  return (
    <div className="app-shell">
      <main
        className="scroll"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: 16,
          paddingBottom: 20,
        }}
      >
        <h1 className="appbar-title" style={{ color: "var(--brand)", fontSize: 26 }}>
          たまりびより
        </h1>

        {handoffFailed && (
          <p role="alert" style={{ fontSize: 13, color: "#777", lineHeight: 1.7 }}>
            ハブのログインを引き継げませんでした。もう一度ハブから開いてください
          </p>
        )}
        {blocked && (
          <p role="alert" style={{ fontSize: 13, color: "#777", lineHeight: 1.7 }}>
            ログインできませんでした。ハブから開き直してください
          </p>
        )}

        <button type="button" className="btn-primary" onClick={handleLogin} style={{ maxWidth: 280 }}>
          ハブでログインする
        </button>

        <nav style={{ display: "flex", gap: 16, fontSize: 12 }}>
          <a href={HUB_TERMS_URL} style={{ color: "#999" }}>
            利用規約
          </a>
          <a href={HUB_PRIVACY_URL} style={{ color: "#999" }}>
            プライバシーポリシー
          </a>
        </nav>
      </main>
    </div>
  );
}
