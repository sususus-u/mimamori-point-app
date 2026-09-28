// メニュー画面「アカウント」の表示名入力欄の初期値用。ログイン中の利用者のuidで、
// ハブのユーザー名窓口(/api/user/name)にDASHBOARD_API_KEYを付けて問い合わせる中継。
// キーをブラウザに露出させないよう、必ずこのサーバー関数を経由させる。
// 利用者は Authorization: Bearer <IDトークン> で確かめ、トークンから取り出したuidだけを使う
// (画面から送られたuidは受け取らない)。
// 問い合わせに失敗した場合も、画面側では入力欄を空欄のままにするだけで済むよう、
// name:null を返す(ベストエフォート)。

import { NextRequest, NextResponse } from "next/server";
import { verifyBearerIdToken } from "@/lib/verifyIdToken";

const HUB_USER_NAME_URL = "https://okizukibiyori.com/api/user/name";
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const uid = await verifyBearerIdToken(req.headers.get("authorization"));
  if (!uid || !process.env.DASHBOARD_API_KEY) {
    return NextResponse.json({ name: null }, { headers: NO_STORE });
  }

  try {
    const url = `${HUB_USER_NAME_URL}?uid=${encodeURIComponent(uid)}`;
    const hubRes = await fetch(url, {
      headers: { "x-dashboard-key": process.env.DASHBOARD_API_KEY },
    });
    if (!hubRes.ok) {
      return NextResponse.json({ name: null }, { headers: NO_STORE });
    }
    const data = await hubRes.json();
    return NextResponse.json({ name: data.username ?? null }, { headers: NO_STORE });
  } catch (error) {
    console.error("user-name error", error);
    return NextResponse.json({ name: null }, { headers: NO_STORE });
  }
}
