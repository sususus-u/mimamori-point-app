import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthProvider";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "たまりびより",
  description: "ポイント・電子マネーの期限管理アプリ",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
