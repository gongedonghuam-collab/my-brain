/**
 * アプリケーションのエントリーポイント
 * Vue.jsを起動し、ルーターやプラグインを読み込んで画面に描画（マウント）します。
 */

import { createApp } from "vue";
import "./style.css"; // Tailwind CSSなどのスタイル読み込み
import App from "./App.vue"; // ルートコンポーネント
import router from "./router"; // 画面遷移の管理

// Vueアプリのインスタンスを作成
const app = createApp(App);

// ルータープラグインを使用（これがないと画面遷移できない）
app.use(router);

// IDが "app" のHTML要素にVueアプリを描画
app.mount("#app");

// --- ローディング画面の消去処理 ---
// index.htmlに書かれている初期ローディング画面（スピナー）を、
// Vueアプリの準備が整ったタイミングでフェードアウトさせます。
const loader = document.getElementById("loading-screen");
if (loader) {
  setTimeout(() => {
    // CSSで透明にする
    loader.style.opacity = "0";
    // アニメーションが終わった頃にDOMから削除
    setTimeout(() => {
      loader.remove();
    }, 500);
  }, 500);
}
