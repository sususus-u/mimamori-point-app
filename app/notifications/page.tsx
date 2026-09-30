"use client";

// 「お知らせ」画面。
// - 一番上: ハブ通知のON/OFFを、この場で切り替えられるスイッチ
// - その下: 「あなたへのお知らせ」「運営からのお知らせ」の2タブ
//
// 「あなたへのお知らせ」は、このアプリにまだ個人向けお知らせ機能自体が
// ないため、当面は固定文言のみを表示する。
// 「運営からのお知らせ」は、ハブの GET /api/announcements を
// /api/announcements 経由(サーバー中継)で問い合わせて表示する。
// 利用者は選んだお知らせを自分の画面から消せる(端末にだけ記録し、サーバーは変えない)。
// 消したものも含めたすべては「過去のお知らせ」(/notifications/all)で見られる。

import { useEffect, useState } from "react";
import Link from "next/link";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthProvider";
import { authFetch } from "@/lib/authFetch";
import { useHasNewAnnouncement } from "@/components/AppShell";
import { timeLabel, useAnnouncements } from "@/lib/announcements";
import { dismissAnnouncements, useDismissedAnnouncementIds } from "@/lib/dismissedAnnouncements";

function PushToggle() {
  const { uid } = useAuth();
  // null は「ハブに問い合わせ中」。確定するまではスイッチを押せないようにする
  // (結果は端末に保存しないので、毎回この状態から始まる)。
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    authFetch("/api/push-status")
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
    if (!uid || saving || enabled === null) return;
    const next = !enabled;
    setSaving(true);
    setMessage(null);
    try {
      const res = await authFetch("/api/push-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
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
            aria-checked={enabled === true}
            aria-busy={enabled === null}
            disabled={!uid || saving || enabled === null}
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

function PastAnnouncementsLink() {
  return (
    <Link href="/notifications/all" className="past-announcements-link">
      過去のお知らせ →
    </Link>
  );
}

function HubAnnouncements() {
  const { uid } = useAuth();
  const announcements = useAnnouncements();
  // 利用者が自分の画面から消したもの。この一覧からは外す(サーバー側は変えない)。
  const dismissedIds = useDismissedAnnouncementIds();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  function handleDismiss() {
    dismissAnnouncements(selectedIds);
    setSelectedIds([]);
    setShowConfirm(false);
  }

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

  const visible = announcements.filter((a) => !dismissedIds.includes(a.id));

  if (visible.length === 0) {
    return (
      <>
        <div className="empty-state">
          <p>
            {announcements.length === 0
              ? "運営からのお知らせは、まだありません"
              : "表示中のお知らせは、ありません"}
          </p>
        </div>
        {announcements.length > 0 && <PastAnnouncementsLink />}
      </>
    );
  }

  // 画面に出ていないもの(消した直後など)は数えない。
  const selectedCount = selectedIds.filter((id) => visible.some((a) => a.id === id)).length;

  return (
    <>
      <div className="announcement-toolbar">
        <button
          type="button"
          className="announcement-dismiss-btn"
          disabled={selectedCount === 0}
          onClick={() => setShowConfirm(true)}
        >
          選んだお知らせを消す{selectedCount > 0 ? `(${selectedCount}件)` : ""}
        </button>
      </div>

      {visible.map((a) => (
        <label className="notif-card announcement-card selectable" key={a.id}>
          <input
            type="checkbox"
            className="announcement-check"
            checked={selectedIds.includes(a.id)}
            onChange={() => toggleSelected(a.id)}
            aria-label={`「${a.title}」を選ぶ`}
          />
          <div className="notif-body">
            <div className="notif-title">{a.title}</div>
            <div className="notif-desc">{a.body}</div>
            <div className="notif-time">{timeLabel(a.publishedAt)}</div>
          </div>
        </label>
      ))}

      <PastAnnouncementsLink />

      {showConfirm && (
        <div className="modal-backdrop">
          <div className="modal-sheet" role="dialog" aria-modal="true">
            <p>
              選んだ{selectedCount}件のお知らせを、この一覧から消します。
              <strong>消したあとは、元に戻せません。</strong>
              「過去のお知らせ」からは、引き続き読むことができます。
            </p>
            <div className="modal-actions">
              <button className="btn-danger" type="button" onClick={handleDismiss}>
                {selectedCount}件を消す
              </button>
              <button className="btn-ghost" type="button" onClick={() => setShowConfirm(false)}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function NotificationsPage() {
  const [tab, setTab] = useState<"personal" | "hub">("personal");
  // ベルの新着ドットと同じ判定。「運営からのお知らせ」タブを開くと既読の日時が記録され、消える。
  // 「あなたへのお知らせ」は個人向けお知らせ機能自体がまだないため、点は出さない。
  const hasNewAnnouncement = useHasNewAnnouncement();

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
          {hasNewAnnouncement && <span className="badge-dot inline" role="img" aria-label="新着あり" />}
        </button>
      </div>

      {tab === "personal" ? <PersonalNotifications /> : <HubAnnouncements />}
    </div>
  );
}
