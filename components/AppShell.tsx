"use client";

// まもりびよりと共通の外枠構造:
// 上部ヘッダー(固定) + 中央スクロール領域 + 下部タブバー(固定)の3段構成。
// 最大幅480pxで、PCで見ても「1枚のカード」として中央に固定表示される。

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wallet, Plus, Menu, LayoutGrid, Bell, BellOff } from "lucide-react";
import { doc, onSnapshot, type Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthProvider";

const HUB_URL = "https://okizukibiyori.com/";

const SCREEN_TITLES: Record<string, string> = {
  "/": "サービス一覧",
  "/accounts/new": "サービスを登録",
  "/accounts/scan": "スクショで登録",
  "/accounts/quick-update": "クイック更新",
  "/menu": "メニュー",
  "/reports": "実績",
  "/notifications": "お知らせ",
};

function getTitle(pathname: string): string {
  if (SCREEN_TITLES[pathname]) return SCREEN_TITLES[pathname];
  if (pathname.startsWith("/accounts/") && pathname.endsWith("/edit")) return "サービスを編集";
  return "たまりびより";
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { uid } = useAuth();
  const [hubPushEnabled, setHubPushEnabled] = useState(false);

  // ハブ側で、このアプリの通知がONになっているか(ベルアイコンの形状切り替え用)。
  // ハブのAPIキーをブラウザに晒さないよう、/api/push-status 経由で問い合わせる。
  // 未ログイン・OFF・問い合わせ失敗はすべて「OFF」扱い(BellOffアイコン表示)。
  useEffect(() => {
    if (!uid) {
      setHubPushEnabled(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/push-status?uid=${encodeURIComponent(uid)}`)
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((data) => {
        if (!cancelled) setHubPushEnabled(data.enabled === true);
      })
      .catch(() => {
        if (!cancelled) setHubPushEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // 運営からのお知らせの「最後に見た日時」。/notifications側でタブを開いた時に
  // users/{uid}.announcements_seen_at へ書き込み、ここでリアルタイムに受け取って
  // ベルの新着ドットを消す。
  const [announcementsSeenAt, setAnnouncementsSeenAt] = useState<Timestamp | null>(null);
  useEffect(() => {
    if (!uid) {
      setAnnouncementsSeenAt(null);
      return;
    }
    const unsubscribe = onSnapshot(doc(db, "users", uid), (snap) => {
      const data = snap.data();
      setAnnouncementsSeenAt((data?.announcements_seen_at as Timestamp | undefined) ?? null);
    });
    return () => unsubscribe();
  }, [uid]);

  // 運営からのお知らせの最新公開日時。ハブ側のannouncementsはFirestoreの直接
  // 購読ができない(DASHBOARD_API_KEY経由のサーバー中継のため)ので、
  // ベルの新着ドット判定用にここで一度だけ取得する。
  const [latestAnnouncementAt, setLatestAnnouncementAt] = useState<string | null>(null);
  useEffect(() => {
    if (!uid) {
      setLatestAnnouncementAt(null);
      return;
    }
    let cancelled = false;
    fetch("/api/announcements")
      .then((r) => (r.ok ? r.json() : { announcements: [] }))
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data.announcements) ? data.announcements : [];
        setLatestAnnouncementAt(list.length > 0 ? list[0].publishedAt : null);
      })
      .catch(() => {
        if (!cancelled) setLatestAnnouncementAt(null);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // 新着があれば、通知のON/OFFに関わらずベルの右上に点を表示する
  // (通知がOFFでも新着があれば点は表示し、状態を正直に伝える)。
  const hasNewAnnouncement =
    latestAnnouncementAt !== null &&
    (!announcementsSeenAt ||
      new Date(latestAnnouncementAt).getTime() > announcementsSeenAt.toMillis());

  const tabs = [
    { href: "/", label: "一覧", icon: Wallet, active: pathname === "/" },
    {
      href: "/accounts/new",
      label: "登録",
      icon: Plus,
      active: pathname.startsWith("/accounts/") && pathname !== "/accounts/quick-update",
    },
    {
      href: "/menu",
      label: "メニュー",
      icon: Menu,
      active: pathname === "/menu" || pathname === "/reports",
    },
  ];

  return (
    <div className="app-shell">
      <header className="appbar">
        <div>
          <p className="appbar-brand">たまりびより</p>
          <h1 className="appbar-title">{getTitle(pathname)}</h1>
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          <Link href="/notifications" className="appbar-home appbar-bell" aria-label="お知らせ">
            {hubPushEnabled ? <Bell size={20} /> : <BellOff size={20} />}
            {hasNewAnnouncement && <span className="badge-dot" />}
          </Link>
          <a href={HUB_URL} className="appbar-home" aria-label="きづきびより ハブに戻る">
            <LayoutGrid size={20} />
          </a>
        </div>
      </header>

      <main className="scroll">{children}</main>

      <nav className="tabbar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`tabbar-item ${tab.active ? "active" : ""}`}
            >
              <Icon size={20} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
