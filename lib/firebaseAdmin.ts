// サーバー専用のFirebase Admin初期化。
// クライアント向けの lib/firebase.ts とは別物(こちらはセキュリティルールを無視して
// 全データにアクセスできるため、Cron等のサーバー処理からのみ使用する)。

import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

function getAdminApp(): App {
  if (getApps().length) return getApps()[0];

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccountJson) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY が設定されていません");
  }
  const serviceAccount = JSON.parse(serviceAccountJson);

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

// ビルド時のページデータ収集でこのモジュールがimportされるだけで例外にならないよう、
// 実際にリクエストが来て使われるまでadmin appの初期化を遅延させる。
function lazy<T extends object>(factory: () => T): T {
  let instance: T | undefined;
  return new Proxy({} as T, {
    get(_target, prop, receiver) {
      if (!instance) instance = factory();
      return Reflect.get(instance as object, prop, receiver);
    },
  });
}

export const adminDb = lazy(() => getFirestore(getAdminApp()));
export const adminMessaging = lazy(() => getMessaging(getAdminApp()));
