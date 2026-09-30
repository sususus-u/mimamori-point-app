"use client";

// 「運営からのお知らせ」の取得と日時表示。「お知らせ」画面と
// 「過去のお知らせ」画面で共通に使う。

import { useEffect, useState } from "react";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
}

// ハブのお知らせ一覧(/api/announcements 経由)。取得中は null。
export function useAnnouncements(): Announcement[] | null {
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

  return announcements;
}

export function timeLabel(iso: string): string {
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
