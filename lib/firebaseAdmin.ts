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

export const adminApp = getAdminApp();
export const adminDb = getFirestore(adminApp);
export const adminMessaging = getMessaging(adminApp);
