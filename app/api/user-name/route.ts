// メニュー画面「アカウント」の表示名入力欄の初期値用。クライアントのuidを受け取り、
// ハブのユーザー名窓口(/api/user/name)にDASHBOARD_API_KEYを付けて問い合わせる中継。
// キーをブラウザに露出させないよう、必ずこのサーバー関数を経由させる。
// 問い合わせに失敗した場合も、画面側では入力欄を空欄のままにするだけで済むよう、
// name:null を返す(ベストエフォート)。

import { NextRequest, NextResponse } from "next/server";

const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const HUB_USER_NAME_URL = "https://okizukibiyori.com/api/user/name";

export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid") ?? "";
  if (!UID_PATTERN.test(uid)) {
    return NextResponse.json({ error: "invalid uid" }, { status: 400 });
  }

  if (!process.env.DASHBOARD_API_KEY) {
    return NextResponse.json({ name: null });
  }

  try {
    const url = `${HUB_USER_NAME_URL}?uid=${encodeURIComponent(uid)}`;
    const hubRes = await fetch(url, {
      headers: { "x-dashboard-key": process.env.DASHBOARD_API_KEY },
    });
    if (!hubRes.ok) {
      return NextResponse.json({ name: null });
    }
    const data = await hubRes.json();
    return NextResponse.json({ name: data.username ?? null });
  } catch (error) {
    console.error("user-name error", error);
    return NextResponse.json({ name: null });
  }
}
