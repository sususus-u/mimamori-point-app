// ブラウザで通知の許可を求め、FCMトークンを取得してFirestoreに保存する処理。

import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { doc, setDoc, arrayUnion, serverTimestamp } from "firebase/firestore";
import { app, db } from "@/lib/firebase";

export async function enableNotifications(uid: string): Promise<
  { success: true } | { success: false; reason: string }
> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return { success: false, reason: "このブラウザは通知に対応していません" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { success: false, reason: "通知が許可されませんでした" };
  }

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    return { success: false, reason: "VAPIDキーが設定されていません" };
  }

  try {
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      return { success: false, reason: "トークンを取得できませんでした" };
    }

    await setDoc(
      doc(db, "users", uid),
      {
        uid,
        fcmTokens: arrayUnion(token),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, reason: "通知の設定中にエラーが発生しました" };
  }
}

/**
 * タブを開いて見ている間(フォアグラウンド)に届いた通知は、
 * サービスワーカーではなくアプリ側で明示的に表示する必要がある。
 * 通知が許可済みの場合、アプリ起動時に呼び出しておく。
 */
export function listenForForegroundMessages() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const messaging = getMessaging(app);
  onMessage(messaging, (payload) => {
    const title = payload.notification?.title || "気づき通知";
    const body = payload.notification?.body || "";
    new Notification(title, { body });
  });
}
