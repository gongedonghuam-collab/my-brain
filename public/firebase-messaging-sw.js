// public/firebase-messaging-sw.js
importScripts(
  "https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js"
);

// Firebase設定 (ご自身のプロジェクト設定に合わせてください)
// ※ vite.envの内容はここでは使えないため、ハードコードするかビルドプロセスで置換が必要です
const firebaseConfig = {
  apiKey: "AIzaSyCd_kTXZpRbQcNZkd6V2-QIAQtBwXzwv40",
  authDomain: "hair-link-app-ee2a3.firebaseapp.com",
  projectId: "hair-link-app-ee2a3",
  storageBucket: "hair-link-app-ee2a3.firebasestorage.app",
  messagingSenderId: "501197211494",
  appId: "1:501197211494:web:93f6bb5b057f0df7872aa7",
  measurementId: "G-2SLGR0821E",
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// バックグラウンド通知のハンドリング
messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Received background message ",
    payload
  );

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: "/logo.png", // アイコン画像のパス
    badge: "/logo.png", // バッジ画像のパス
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
