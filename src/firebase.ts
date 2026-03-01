/**
 * Firebase（バックエンドサービス）の初期化設定ファイル
 * アプリ全体で使う「認証」「データベース」「ストレージ」などの機能をここで準備します。
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore, memoryLocalCache } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging } from "firebase/messaging";

// 環境変数 (.envファイル) から設定値を読み込み
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// --- アプリの初期化 (Singletonパターン) ---
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

/** 認証機能 (ログイン/ログアウト) */
export const auth = getAuth(app);

// ★超重要：TikTokやInstagramブラウザでクラッシュ(ブラックアウト)しないよう、
// 強制的に「メモリキャッシュのみ(IndexedDBを一切使わない)」で動作させる
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
});

/** ファイルストレージ (画像の保存先) */
export const storage = getStorage(app);

/** プッシュ通知機能 */
export const messaging = getMessaging(app);

/** Googleログイン用のプロバイダ設定 */
export const googleProvider = new GoogleAuthProvider();
