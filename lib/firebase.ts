// Firebaseクライアントの初期化。
// Next.jsのホットリロードで何度も初期化されないよう、getApps()で既存インスタンスを確認する。

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import { extractAuthToken } from "@/lib/authToken";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// ハブ(okizukibiyori.com)からURLに ?authToken=xxx または #authToken=xxx(こちらを優先)が付与されて遷移してきた場合、
// そのカスタムトークンでログインする。
//
// auth.currentUserの永続化復元(非同期)が先に終わってしまうと、既存の匿名ユーザーが
// そのまま使われてカスタムトークンでのログインが素通りされる競合状態が起きるため、
// モジュール読み込み時点(=このファイルがimportされた瞬間)で即座に処理を開始し、
// 他の場所(AuthProviderのonAuthStateChanged購読)はこのPromiseを必ず待ってから動く。
//
// 引き継ぎに失敗しても、匿名ログインにはしない(アプリは案内の画面で止まる)。
// 失敗の印はメモリ上だけに持つ(authToken はアドレスから消すので、再読み込みでは残らない)。
let customTokenHandoffFailed = false;

export function hasCustomTokenHandoffFailed(): boolean {
  return customTokenHandoffFailed;
}

// アドレスから authToken(クエリ・フラグメント)を消す。ほかの部分は残す。
// Next.js が読み込み後にアドレスを書き戻すことがあるため、AuthProvider からも呼び直す。
export function removeAuthTokenFromUrl(): void {
  if (typeof window === "undefined") return;
  const { cleanedPath } = extractAuthToken(window.location.href);
  if (cleanedPath !== window.location.pathname + window.location.search + window.location.hash) {
    window.history.replaceState(null, "", cleanedPath);
  }
}

export const customTokenSignInReady: Promise<void> = (async () => {
  if (typeof window === "undefined") return;

  // 読んだらすぐ、アドレスから消す(クエリもフラグメントも。成否を待たない)
  const { token, rejected } = extractAuthToken(window.location.href);
  removeAuthTokenFromUrl();
  if (rejected) {
    customTokenHandoffFailed = true;
    console.error("カスタムトークンが長すぎるため、ログインを行いませんでした");
    return;
  }
  if (!token) return;

  try {
    await signInWithCustomToken(auth, token);
  } catch (error) {
    customTokenHandoffFailed = true;
    // トークンを含みうるため、エラーの中身は出さず、コードだけ残す
    const code = (error as { code?: string } | null)?.code ?? "unknown";
    console.error("カスタムトークンでのログインに失敗しました:", code);
  }
})();
