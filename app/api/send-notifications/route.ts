// 毎日1回、Vercel Cronから呼び出される通知送信バッチ。
// 全ユーザーの全口座を確認し、通知タイミング(1段階目/2段階目)に該当する口座があれば
// プッシュ通知を送る。同じ期限日に対して二重送信しないよう、送信済みフラグを記録する。

import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb, adminMessaging } from "@/lib/firebaseAdmin";
import type { AccountDoc, UserDoc } from "@/types/firestore";

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: Date, to: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const fromMidnight = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toMidnight = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toMidnight.getTime() - fromMidnight.getTime()) / msPerDay);
}

export async function GET(req: NextRequest) {
  // Vercel Cronからの呼び出しであることを確認(手違いで誰でも叩けないようにする)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const today = new Date();
  const accountsSnap = await adminDb.collection("accounts").get();

  let sentCount = 0;
  let skippedCount = 0;

  for (const accountDoc of accountsSnap.docs) {
    const account = accountDoc.data() as AccountDoc;
    if (!account.expiryDate) continue;

    const expiry = (account.expiryDate as unknown as Timestamp).toDate();
    const daysUntilExpiry = daysBetween(today, expiry);
    const expiryIso = toIsoDate(expiry);

    const { firstStageDays, secondStageDays } = account.notificationTiming;

    let stage: "first" | "second" | null = null;
    if (daysUntilExpiry === secondStageDays && account.notifiedSecondStageForDate !== expiryIso) {
      stage = "second";
    } else if (daysUntilExpiry === firstStageDays && account.notifiedFirstStageForDate !== expiryIso) {
      stage = "first";
    }

    if (!stage) {
      skippedCount++;
      continue;
    }

    const userSnap = await adminDb.collection("users").doc(account.ownerId).get();
    const user = userSnap.data() as UserDoc | undefined;
    const tokens = user?.fcmTokens ?? [];
    if (tokens.length === 0) {
      skippedCount++;
      continue;
    }

    const body =
      stage === "first"
        ? `${account.name}、そろそろ確認のタイミングです`
        : `${account.name}、期限まであと${daysUntilExpiry}日です`;

    try {
      await adminMessaging.sendEachForMulticast({
        tokens,
        notification: {
          title: "気づき通知",
          body,
        },
        webpush: {
          fcmOptions: {
            link: "/",
          },
        },
      });
      sentCount++;

      await accountDoc.ref.update(
        stage === "first"
          ? { notifiedFirstStageForDate: expiryIso }
          : { notifiedSecondStageForDate: expiryIso }
      );
    } catch (error) {
      console.error(`通知送信に失敗しました(accountId: ${accountDoc.id})`, error);
    }
  }

  return NextResponse.json({ sentCount, skippedCount, checkedAt: today.toISOString() });
}
