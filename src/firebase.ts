/**
 * Firebase（バックエンドサービス）の初期化設定ファイル
 * アプリ全体で使う「認証」「データベース」「ストレージ」などの機能をここで準備します。
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging } from "firebase/messaging";

// 環境変数 (.envファイル) から設定値を読み込み
// これにより、本番環境と開発環境で接続先を切り替えられます
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
// 既に初期化済みなら既存のアプリを取得し、まだなら新規に初期化します。
// これにより、二重初期化によるエラーを防ぎます。
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

/** 認証機能 (ログイン/ログアウト) */
export const auth = getAuth(app);

// --- Firestore初期化 (極限まで安全なインアプリブラウザ対策) ---
let dbInstance;

try {
  // 既に初期化されていないかチェック
  dbInstance = getFirestore(app);
} catch (e) {
  // 初期化に失敗（IndexedDBエラーなど）した場合
  console.error("Firestore init failed, using fallback:", e);

  try {
    // 【対策1】IndexedDBを一切使わず、メモリ(RAM)だけ使うモードで初期化
    dbInstance = initializeFirestore(app, {
      localCache: memoryLocalCache(),
    });
  } catch (err) {
    // 【対策2】それすら失敗した場合は、最小構成のインスタンスを生成
    console.error("Critical Firestore Error:", err);
    dbInstance = getFirestore(app);
  }
}
export const db = dbInstance;

/** ファイルストレージ (画像の保存先) */
export const storage = getStorage(app);

/** プッシュ通知機能 */
export const messaging = getMessaging(app);

/** Googleログイン用のプロバイダ設定 */
export const googleProvider = new GoogleAuthProvider();
