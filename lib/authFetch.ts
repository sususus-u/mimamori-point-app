// ログイン中の利用者のIDトークンを Authorization: Bearer に付けて、自分のサーバー窓口を呼ぶ。
// 窓口側はトークンから本人のuidを取り出すので、画面からuidを送る必要はない。
// トークンが取れない場合(未ログイン・通信不可など)は、付けずに送る(窓口側で「未ログイン」扱い)。

import { auth } from "@/lib/firebase";

export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  try {
    const token = await auth.currentUser?.getIdToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  } catch {
    // トークンが取れなくても、そのまま送る
  }
  return fetch(input, { ...init, headers });
}
