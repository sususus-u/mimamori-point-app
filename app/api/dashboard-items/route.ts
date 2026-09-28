// ハブのダッシュボード機能向けに、ログイン中の利用者本人の口座のうち期限が近い上位3件を返す読み取り専用API。
// x-dashboard-key ヘッダーが環境変数 DASHBOARD_API_KEY と一致する場合のみ許可する。
// 利用者は Authorization: Bearer <IDトークン> で確かめ、ownerId で絞る。
// トークンが無い・確かめられない場合は空の一覧を返す。

import { NextRequest, NextResponse } from "next/server";
import type { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { verifyBearerIdToken } from "@/lib/verifyIdToken";
import { CATEGORY_DEFAULTS, type AccountDoc } from "@/types/firestore";

const NO_STORE = { "Cache-Control": "private, no-store" };

function daysBetween(from: Date, to: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const fromMidnight = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toMidnight = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toMidnight.getTime() - fromMidnight.getTime()) / msPerDay);
}

export async function GET(req: NextRequest) {
  const dashboardKey = req.headers.get("x-dashboard-key");
  if (!dashboardKey || dashboardKey !== process.env.DASHBOARD_API_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const uid = await verifyBearerIdToken(req.headers.get("authorization"));
  if (!uid) {
    return NextResponse.json({ items: [] }, { headers: NO_STORE });
  }

  const today = new Date();
  const accountsSnap = await adminDb.collection("accounts").where("ownerId", "==", uid).get();

  const items = accountsSnap.docs
    .map((doc) => doc.data() as AccountDoc)
    .filter((account) => Boolean(account.expiryDate))
    .map((account) => {
      const expiry = (account.expiryDate as unknown as Timestamp).toDate();
      const daysRemaining = daysBetween(today, expiry);
      const [, secondStageDays] = CATEGORY_DEFAULTS[account.category].notificationDaysBefore;
      const level: "danger" | "warning" = daysRemaining <= secondStageDays ? "danger" : "warning";
      return { name: account.name, daysRemaining, level };
    })
    .filter((item) => item.daysRemaining >= 0)
    .sort((a, b) => a.daysRemaining - b.daysRemaining)
    .slice(0, 3);

  return NextResponse.json({ items }, { headers: NO_STORE });
}
