// ハブから「このuidの人のデータをすべて削除してください」という依頼を受ける窓口
// (利用者本人によるアカウント削除)。
// x-dashboard-key ヘッダーが環境変数 DASHBOARD_API_KEY と一致する場合のみ処理する。
// 依頼は DELETE /api/account-data で、本文は {"uid": "..."}。
// 消すもの: accounts(と、その中のupdates)・outcome_events・usage_counts_tamari・users/{uid}。
// Firebase Authのログイン情報そのものは、姉妹アプリと同じプロジェクトを共用していて
// 他のアプリにも影響するため、ここでは消さない(アプリ側のデータだけを消す)。

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function DELETE(req: NextRequest) {
  const dashboardKey = req.headers.get("x-dashboard-key");
  if (!process.env.DASHBOARD_API_KEY || dashboardKey !== process.env.DASHBOARD_API_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  let uid: unknown;
  try {
    uid = ((await req.json()) as { uid?: unknown }).uid;
  } catch {
    uid = undefined;
  }
  // uidが空や、パスとして不正な値(「/」を含む等)のまま、意図しない場所を消さないようにする
  if (typeof uid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
    return NextResponse.json({ error: "invalid uid" }, { status: 400, headers: NO_STORE });
  }

  try {
    const [accountsSnap, eventsSnap, usageSnap] = await Promise.all([
      adminDb.collection("accounts").where("ownerId", "==", uid).get(),
      adminDb.collection("outcome_events").where("ownerId", "==", uid).get(),
      adminDb.collection("usage_counts_tamari").where("uid", "==", uid).get(),
    ]);

    // 口座は、中のupdates(更新履歴)を先に消してから口座本体を消す。
    // (recursiveDelete は、adminDbが遅延初期化のProxyのため動かないので使わない)
    for (const doc of accountsSnap.docs) {
      const updatesSnap = await doc.ref.collection("updates").get();
      for (const update of updatesSnap.docs) {
        await update.ref.delete();
      }
      await doc.ref.delete();
    }
    for (const doc of [...eventsSnap.docs, ...usageSnap.docs]) {
      await doc.ref.delete();
    }
    await adminDb.collection("users").doc(uid).delete();

    // 件数だけをログに残す(uidや口座名などの中身は出さない)
    console.log(
      "account-data 削除完了",
      JSON.stringify({
        accounts: accountsSnap.size,
        outcomeEvents: eventsSnap.size,
        usageCounts: usageSnap.size,
      }),
    );
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch (error) {
    console.error("account-data 削除エラー", error);
    return NextResponse.json({ success: false, error: "delete failed" }, { status: 500, headers: NO_STORE });
  }
}
