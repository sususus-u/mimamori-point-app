"use client";

// まもりびよりと共通の外枠構造:
// 上部ヘッダー(固定) + 中央スクロール領域 + 下部タブバー(固定)の3段構成。
// 最大幅480pxで、PCで見ても「1枚のカード」として中央に固定表示される。

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet, Plus, Menu } from "lucide-react";

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
        <p className="appbar-brand">たまりびより</p>
        <h1 className="appbar-title">{getTitle(pathname)}</h1>
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
