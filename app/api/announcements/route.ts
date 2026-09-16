// 「お知らせ」画面の「運営からのお知らせ」タブ用。ハブの
// GET /api/announcements にDASHBOARD_API_KEYを付けて問い合わせる中継。
// キーをブラウザに露出させないよう、必ずこのサーバー関数を経由させる。
// 問い合わせに失敗した場合も、画面側では「お知らせなし」として
// 表示するだけで済むよう、空配列を返す(ベストエフォート)。

import { NextResponse } from "next/server";

const HUB_ANNOUNCEMENTS_URL = "https://okizukibiyori.com/api/announcements";
const APP_ID = "tamari-biyori";

export async function GET() {
  if (!process.env.DASHBOARD_API_KEY) {
    return NextResponse.json({ announcements: [] });
  }

  try {
    const url = `${HUB_ANNOUNCEMENTS_URL}?app=${APP_ID}`;
    const hubRes = await fetch(url, {
      headers: { "x-dashboard-key": process.env.DASHBOARD_API_KEY },
      cache: "no-store",
    });
    if (!hubRes.ok) {
      return NextResponse.json({ announcements: [] });
    }
    const data = await hubRes.json();
    return NextResponse.json({ announcements: data.announcements ?? [] });
  } catch (error) {
    console.error("announcements error", error);
    return NextResponse.json({ announcements: [] });
  }
}
