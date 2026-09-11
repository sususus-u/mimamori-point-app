"use client";

// まもりびよりと共通の外枠構造:
// 上部ヘッダー(固定) + 中央スクロール領域 + 下部タブバー(固定)の3段構成。
// 最大幅480pxで、PCで見ても「1枚のカード」として中央に固定表示される。

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wallet, Plus, Menu, LayoutGrid, Bell } from "lucide-react";
import { useAuth } from "@/contexts/AuthProvider";

const HUB_URL = "https://okizukibiyori.com/";
const HUB_NOTIFICATION_SETTINGS_URL = "https://okizukibiyori.com/settings";

const SCREEN_TITLES: Record<string, string> = {
  "/": "サービス一覧",
  "/accounts/new": "サービスを登録",
  "/accounts/scan": "スクショで登録",
  "/accounts/quick-update": "クイック更新",
  "/menu": "メニュー",
  "/reports": "実績",
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

  // ハブ側で、このアプリの通知がONになっているか(ベルマークのバッジ表示用)。
  // ハブのAPIキーをブラウザに晒さないよう、/api/push-status 経由で問い合わせる。
  // 未ログイン・OFF・問い合わせ失敗はすべてバッジ非表示(false)扱い。
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
          <a
            href={HUB_NOTIFICATION_SETTINGS_URL}
            className="appbar-home"
            aria-label="通知設定(ハブ)"
            style={{ position: "relative" }}
          >
            <Bell size={20} />
            {hubPushEnabled && <span className="appbar-bell-badge" aria-hidden="true" />}
          </a>
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
