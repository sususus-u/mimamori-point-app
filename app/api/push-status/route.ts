// ハブ(おきづきびより)へ、ログイン中の利用者がこのアプリの通知をONに
// しているかを問い合わせる中継。ハブのAPIキー(DASHBOARD_API_KEY、ダッシュボード
// 機能と共通の鍵)をブラウザに露出させないため、必ずこのサーバー関数を経由させる。
// 利用者は Authorization: Bearer <IDトークン> で確かめ、トークンから取り出したuidだけを使う
// (画面から送られたuidは受け取らない)。
// 問い合わせ失敗時もエラーにはせず enabled:false を返す(ヘッダーのベルマークの
// バッジを出さないだけで、機能自体は止めない)。

import { NextRequest, NextResponse } from "next/server";
import { verifyBearerIdToken } from "@/lib/verifyIdToken";

const HUB_PUSH_STATUS_URL = "https://okizukibiyori.com/api/push/status";
const APP_ID = "tamari-biyori";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const uid = await verifyBearerIdToken(req.headers.get("authorization"));
  if (!uid || !process.env.DASHBOARD_API_KEY) {
    return NextResponse.json({ enabled: false }, { headers: NO_STORE });
  }

  try {
    const url = `${HUB_PUSH_STATUS_URL}?uid=${encodeURIComponent(uid)}&app=${APP_ID}`;
    const hubRes = await fetch(url, {
      headers: { "x-dashboard-key": process.env.DASHBOARD_API_KEY },
    });
    if (!hubRes.ok) {
      return NextResponse.json({ enabled: false }, { headers: NO_STORE });
    }
    const data = await hubRes.json();
    return NextResponse.json({ enabled: data.enabled === true }, { headers: NO_STORE });
  } catch (error) {
    console.error("push-status error", error);
    return NextResponse.json({ enabled: false }, { headers: NO_STORE });
  }
}

// お知らせ画面のスイッチから、このアプリぶんの通知ON/OFFだけを切り替える窓口。
// ブラウザのPush購読情報(endpoint/keys)はハブのオリジンでしか取得できないため、
// ここではuidを渡してハブ側に「そのuidの既存購読を探してapps[app]を書き換える」
// 処理を任せる。まだ一件も購読が無い(=ハブ側で通知を許可したことがない)場合は
// ハブが404 no_subscriptionを返すので、そのまま伝える。
export async function PATCH(req: NextRequest) {
  const uid = await verifyBearerIdToken(req.headers.get("authorization"));
  if (!uid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const body: unknown = await req.json().catch(() => null);
  const enabled =
    body && typeof body === "object" ? (body as Record<string, unknown>).enabled : null;

  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled is required" }, { status: 400, headers: NO_STORE });
  }

  if (!process.env.DASHBOARD_API_KEY) {
    return NextResponse.json({ error: "failed" }, { status: 502, headers: NO_STORE });
  }

  try {
    const hubRes = await fetch(HUB_PUSH_STATUS_URL, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-dashboard-key": process.env.DASHBOARD_API_KEY,
      },
      body: JSON.stringify({ uid, app: APP_ID, enabled }),
    });
    const data = await hubRes.json().catch(() => ({}));
    if (!hubRes.ok) {
      return NextResponse.json(
        { error: data.error ?? "failed" },
        { status: hubRes.status, headers: NO_STORE }
      );
    }
    return NextResponse.json({ enabled: data.enabled === true }, { headers: NO_STORE });
  } catch (error) {
    console.error("push-status patch error", error);
    return NextResponse.json({ error: "failed" }, { status: 502, headers: NO_STORE });
  }
}
