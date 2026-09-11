// ハブ(おきづきびより)へ、ログイン中の利用者(uid)がこのアプリの通知をONに
// しているかを問い合わせる中継。ハブのAPIキー(DASHBOARD_API_KEY、ダッシュボード
// 機能と共通の鍵)をブラウザに露出させないため、必ずこのサーバー関数を経由させる。
// 問い合わせ失敗時もエラーにはせず enabled:false を返す(ヘッダーのベルマークの
// バッジを出さないだけで、機能自体は止めない)。

import { NextRequest, NextResponse } from "next/server";

const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const HUB_PUSH_STATUS_URL = "https://okizukibiyori.com/api/push/status";
const APP_ID = "tamari-biyori";

export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid") ?? "";
  if (!UID_PATTERN.test(uid)) {
    return NextResponse.json({ error: "invalid uid" }, { status: 400 });
  }

  if (!process.env.DASHBOARD_API_KEY) {
    return NextResponse.json({ enabled: false });
  }

  try {
    const url = `${HUB_PUSH_STATUS_URL}?uid=${encodeURIComponent(uid)}&app=${APP_ID}`;
    const hubRes = await fetch(url, {
      headers: { "x-dashboard-key": process.env.DASHBOARD_API_KEY },
    });
    if (!hubRes.ok) {
      return NextResponse.json({ enabled: false });
    }
    const data = await hubRes.json();
    return NextResponse.json({ enabled: data.enabled === true });
  } catch (error) {
    console.error("push-status error", error);
    return NextResponse.json({ enabled: false });
  }
}
