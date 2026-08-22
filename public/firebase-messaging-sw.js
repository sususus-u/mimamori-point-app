// FCMのバックグラウンド通知を受け取るためのサービスワーカー。
// public直下に置く静的ファイルのため、環境変数は使えない。
// ここに書く設定値は元々ブラウザに公開される情報(NEXT_PUBLIC_*)なので問題ない。

importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBKrwgSZCZRw8pE5EIb1ShqQj_F0S6NMrg",
  authDomain: "mimamori-point-app.firebaseapp.com",
  projectId: "mimamori-point-app",
  storageBucket: "mimamori-point-app.firebasestorage.app",
  messagingSenderId: "279803505875",
  appId: "1:279803505875:web:8e5355ca6cb46f41993826",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "気づき通知";
  const body = payload.notification?.body || "";
  self.registration.showNotification(title, { body });
});
