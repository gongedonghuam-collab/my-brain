// public/firebase-messaging-sw.js
importScripts(
  "https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js",
);

// Firebase設定 (ご自身のプロジェクト設定に合わせてください)
// ※ vite.envの内容はここでは使えないため、ハードコードするかビルドプロセスで置換が必要です
const firebaseConfig = {
  apiKey: "AIzaSyASEFgUclaLh1fvHW5k0OSIluT7D2Ekq2M",
  authDomain: "my-brain-145b1.firebaseapp.com",
  projectId: "my-brain-145b1",
  storageBucket: "my-brain-145b1.firebasestorage.app",
  messagingSenderId: "431208476657",
  appId: "1:431208476657:web:23f150bffbe65e6d479e50",
  measurementId: "G-T0GV83YGEG",
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// バックグラウンド通知のハンドリング
messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Received background message ",
    payload,
  );

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: "/logo.png", // アイコン画像のパス
    badge: "/logo.png", // バッジ画像のパス
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
