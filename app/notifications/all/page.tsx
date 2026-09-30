"use client";

// 「過去のお知らせ」。運営からのお知らせを、利用者が自分の画面から消したものも
// 含めてすべて表示する。見るだけの画面なので、選ぶ・消すなどの操作は置かない。

import Link from "next/link";
import { timeLabel, useAnnouncements } from "@/lib/announcements";

export default function PastAnnouncementsPage() {
  const announcements = useAnnouncements();

  return (
    <div>
      <Link href="/notifications" className="back-link">
        ← お知らせに戻る
      </Link>

      {announcements === null ? (
        <div className="loading-state">読み込み中…</div>
      ) : announcements.length === 0 ? (
        <div className="empty-state">
          <p>運営からのお知らせは、まだありません</p>
        </div>
      ) : (
        announcements.map((a) => (
          <div className="notif-card announcement-card" key={a.id}>
            <div className="notif-body">
              <div className="notif-title">{a.title}</div>
              <div className="notif-desc">{a.body}</div>
              <div className="notif-time">{timeLabel(a.publishedAt)}</div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
