// Firebaseクライアントの初期化。
// Next.jsのホットリロードで何度も初期化されないよう、getApps()で既存インスタンスを確認する。

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInWithCustomToken } from "firebase/auth";

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

// ハブ(okizukibiyori.com)からURLに ?authToken=xxx が付与されて遷移してきた場合、
// そのカスタムトークンでログインする。
//
// auth.currentUserの永続化復元(非同期)が先に終わってしまうと、既存の匿名ユーザーが
// そのまま使われてカスタムトークンでのログインが素通りされる競合状態が起きるため、
// モジュール読み込み時点(=このファイルがimportされた瞬間)で即座に処理を開始し、
// 他の場所(AuthProviderのonAuthStateChanged購読)はこのPromiseを必ず待ってから動く。
export const customTokenSignInReady: Promise<void> = (async () => {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  const token = url.searchParams.get("authToken");
  if (!token) return;

  try {
    await signInWithCustomToken(auth, token);
  } catch (error) {
    console.error("カスタムトークンでのログインに失敗しました", error);
  } finally {
    // 成否によらず、URLからauthTokenパラメータを消しておく
    url.searchParams.delete("authToken");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
})();
