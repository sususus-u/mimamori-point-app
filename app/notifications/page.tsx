"use client";

// 「お知らせ」画面。
// - 一番上: ハブ通知のON/OFFを、この場で切り替えられるスイッチ
// - その下: 「あなたへのお知らせ」「運営からのお知らせ」の2タブ
//
// 「あなたへのお知らせ」は、このアプリにまだ個人向けお知らせ機能自体が
// ないため、当面は固定文言のみを表示する。
// 「運営からのお知らせ」は、ハブの GET /api/announcements を
// /api/announcements 経由(サーバー中継)で問い合わせて表示する。

import { useEffect, useState } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthProvider";

interface Announcement {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
}

function timeLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return `今日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }
  const diffDays = Math.floor(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) /
      86_400_000,
  );
  if (diffDays >= 0 && diffDays < 7) return `${diffDays}日前`;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function PushToggle() {
  const { uid } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    fetch(`/api/push-status?uid=${encodeURIComponent(uid)}`)
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((data) => {
        if (!cancelled) setEnabled(data.enabled === true);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  async function handleToggle() {
    if (!uid || saving) return;
    const next = !enabled;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/push-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid, enabled: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(
          data.error === "no_subscription"
            ? "この端末では通知が許可されていません。ハブ側の通知設定をご確認ください。"
            : "切り替えに失敗しました。時間をおいて再度お試しください。",
        );
        return;
      }
      setEnabled(next);
      setMessage(next ? "通知をONにしました" : "通知をOFFにしました");
    } catch {
      setMessage("切り替えに失敗しました。時間をおいて再度お試しください。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="push-toggle">
      <div className="settings-card">
        <div className="settings-row">
          <div>
            <div className="label">通知</div>
            <div className="sub">たまりびよりからのお知らせを受け取る</div>
          </div>
          <button
            type="button"
            className={`switch ${enabled ? "on" : ""}`}
            role="switch"
            aria-checked={enabled}
            disabled={!uid || saving}
            onClick={handleToggle}
          />
        </div>
      </div>
      {message && <p className="push-toggle-message">{message}</p>}
    </div>
  );
}

function PersonalNotifications() {
  return (
    <div className="empty-state">
      <p>お知らせは、まだありません</p>
    </div>
  );
}

function HubAnnouncements() {
  const { uid } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/announcements")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setAnnouncements(Array.isArray(data.announcements) ? data.announcements : []);
        }
      })
      .catch(() => {
        if (!cancelled) setAnnouncements([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // このタブを開いた時点で最新のお知らせを見たとみなし、既読相当の日時を記録する
  // (ヘッダーのベルの新着ドット判定に使う。AppShell側でこのドキュメントを
  // onSnapshotで見ているのでリアルタイムに反映される)。
  useEffect(() => {
    if (!uid || !announcements || announcements.length === 0) return;
    setDoc(doc(db, "users", uid), { announcements_seen_at: serverTimestamp() }, { merge: true }).catch(
      () => {},
    );
  }, [uid, announcements]);

  if (announcements === null) {
    return <div className="loading-state">読み込み中…</div>;
  }

  if (announcements.length === 0) {
    return (
      <div className="empty-state">
        <p>運営からのお知らせは、まだありません</p>
      </div>
    );
  }

  return (
    <>
      {announcements.map((a) => (
        <div className="notif-card announcement-card" key={a.id}>
          <div className="notif-body">
            <div className="notif-title">{a.title}</div>
            <div className="notif-desc">{a.body}</div>
            <div className="notif-time">{timeLabel(a.publishedAt)}</div>
          </div>
        </div>
      ))}
    </>
  );
}

export default function NotificationsPage() {
  const [tab, setTab] = useState<"personal" | "hub">("personal");

  return (
    <div>
      <PushToggle />

      <div className="notif-tabs">
        <button
          type="button"
          className={tab === "personal" ? "active" : ""}
          onClick={() => setTab("personal")}
        >
          あなたへのお知らせ
        </button>
        <button
          type="button"
          className={tab === "hub" ? "active" : ""}
          onClick={() => setTab("hub")}
        >
          運営からのお知らせ
        </button>
      </div>

      {tab === "personal" ? <PersonalNotifications /> : <HubAnnouncements />}
    </div>
  );
}
