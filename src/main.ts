/**
 * アプリケーションのエントリーポイント
 * Vue.jsを起動し、ルーターやプラグインを読み込んで画面に描画（マウント）します。
 */

import { createApp } from "vue";
import "./style.css"; // Tailwind CSSなどのスタイル読み込み
import App from "./App.vue"; // ルートコンポーネント
import router from "./router"; // 画面遷移の管理

// ★ ここが最重要！ index.htmlで「アプリ内ブラウザ」と判定された場合は、
// Firebase等が動いてクラッシュする前に、Vueアプリ自体の起動をストップさせます。
if ((window as any).__IN_APP_BROWSER__) {
  console.log("App blocked in in-app browser. Showing guidance screen.");
} else {
  // 普通のブラウザ（SafariやChrome）の場合は、通常通りアプリを起動
  const app = createApp(App);

  // ★ 万が一の未知のエラーに備えたグローバルエラーハンドラー（真っ黒防止）
  app.config.errorHandler = (err, instance, info) => {
    console.error("Vue Global Error:", err, info);
    document.body.innerHTML = `
      <div style="background:#0f172a; color:white; height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:20px; text-align:center;">
        <div style="font-size:50px; margin-bottom:20px;">⚠️</div>
        <h1 style="font-size:20px; margin-bottom:10px;">アプリ内でエラーが発生しました</h1>
        <p style="font-size:14px; opacity:0.8; margin-bottom:30px;">
          TikTokやInstagramのブラウザの制限により<br>正常に動作していません💦
        </p>
        <div style="background:#3b82f6; padding:15px; border-radius:12px; font-weight:bold; box-shadow: 0 4px 15px rgba(59,130,246,0.4);">
          右上の「･･･」や「矢印」から<br>「ブラウザで開く」を選択してください！
        </div>
      </div>
    `;
  };

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
    }, 500); // ロードが早すぎる場合のチラつき防止で500ms待機
  }
}
