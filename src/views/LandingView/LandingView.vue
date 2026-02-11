<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();

const goToLogin = () => {
  router.push("/login");
};
</script>

<template>
  <div class="lp-container">
    <div class="nav-hint">Scroll or Use Arrow Keys ↓</div>

    <div class="slides-container" id="container">
      <section id="s1">
        <div class="bg-blob primary-blob"></div>
        <div class="logo-wrapper">
          <img
            src="/logo.png?v=3"
            width="80"
            height="80"
            class="lp-logo fade-in-up"
            alt="My Brain Logo"
          />
        </div>
        <p class="fade-in-up subtitle">LINE-BASED AI ASSISTANT</p>
        <h1 class="fade-in-up delay-100">
          LINEに送るだけ。<br />勝手にスケジュール管理。
        </h1>
        <p class="fade-in-up delay-200 description">
          カレンダー入力、タスク管理、メモの整理。<br />
          面倒なことは全部、LINEに投げ捨てるだけ。<br />
          ズボラなあなたのための、最強のAI秘書です。
        </p>
        <button @click="goToLogin" class="btn-primary fade-in-up delay-300">
          LINEで秘書を雇う (無料)
        </button>

        <div class="fade-in-up delay-500 mock-wrapper">
          <div class="phone">
            <div class="notch"></div>
            <div class="screen">
              <div class="line-header">My Brain (LINE)</div>
              <div class="chat-bubble chat-user">
                明日19時 渋谷で田中さんと焼き鳥！
              </div>
              <div class="chat-bubble chat-ai">
                <div>承知しました！登録完了です🫡</div>
                <div
                  class="mt-2 p-2 bg-slate-800 rounded-lg border border-slate-700"
                >
                  <div class="text-[10px] text-slate-400 font-bold">
                    SCHEDULED
                  </div>
                  <div class="text-sm font-bold">19:00 田中さんと焼き鳥</div>
                  <div class="text-xs text-slate-400">📍 渋谷</div>
                  <div class="text-xs text-blue-300 mt-1">☔ 雨予報 (60%)</div>
                </div>
              </div>

              <div class="calendar-widget">
                <div class="cal-header">Google Calendar</div>
                <div class="cal-grid">
                  <div class="cal-time">19:00</div>
                  <div class="cal-event">
                    <span class="font-bold">田中さんと焼き鳥</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="s2">
        <h2 class="fade-in-up">The Pain</h2>
        <h1 class="fade-in-up delay-100 section-title">
          アプリの使い分け、<br />疲れていませんか？
        </h1>
        <div class="grid-container fade-in-up delay-200">
          <div class="card-box">
            <span class="icon">📱</span>
            <h3>アプリを行き来する</h3>
            <p>
              予定はカレンダー、タスクはToDo、メモはNotion...。<br />
              情報が散らばって、結局どこに書いたか忘れる。
            </p>
          </div>
          <div class="card-box">
            <span class="icon">📅</span>
            <h3>入力がめんどくさい</h3>
            <p>
              カレンダーアプリを開いて、日付を選んで、タイトルを入れて...。<br />
              その「数タップ」すら億劫で、後回しにしてしまう。
            </p>
          </div>
          <div class="card-box">
            <span class="icon">😱</span>
            <h3>ダブルブッキング</h3>
            <p>
              「あ、その日美容院だった...」<br />
              予定を入れる瞬間に空き状況を確認し忘れて、冷や汗をかく。
            </p>
          </div>
        </div>
      </section>

      <section id="s3">
        <div class="bg-blob accent-blob"></div>
        <h2 class="fade-in-up">Simple Solution</h2>
        <h1 class="fade-in-up delay-100 section-title">
          LINEひとつで、<br />全て片付きます。
        </h1>
        <p class="fade-in-up delay-200 description">
          新しいアプリを覚える必要はありません。<br />
          いつも使っているLINEで、友達に話すように送るだけです。
        </p>

        <div class="feature-list fade-in-up delay-300">
          <div class="feature-item">
            <div class="f-icon-box">📅</div>
            <div class="f-text">
              <h3>予定を入れる</h3>
              <p>
                「来週の水曜ランチ」と送るだけ。AIが日付を解釈してGoogleカレンダーに登録します。
              </p>
            </div>
          </div>
          <div class="feature-item">
            <div class="f-icon-box">✅</div>
            <div class="f-text">
              <h3>タスク管理</h3>
              <p>
                「洗剤買う」「振込する」もLINEへ。完了したら報告すれば消し込みまでやってくれます。
              </p>
            </div>
          </div>
          <div class="feature-item">
            <div class="f-icon-box">🧠</div>
            <div class="f-text">
              <h3>第2の脳（メモ）</h3>
              <p>
                「パスワードは〇〇」「いいアイデア出た」など、何でも放り込んでOK。AIが必要な時に思い出させてくれます。
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="s4">
        <h2 class="fade-in-up">Pro Features</h2>
        <h1 class="fade-in-up delay-100 section-title">
          AIだからできる、<br />「気配り」機能。
        </h1>
        <div class="grid-container fade-in-up delay-200">
          <div class="card-box highlight-box">
            <span class="icon">🌤️</span>
            <h3>天気を先読み</h3>
            <p>
              「その日は雨予報です☔」<br />
              予定を入れる瞬間に天気を教えてくれるので、傘を忘れません。
            </p>
          </div>
          <div class="card-box">
            <span class="icon">📢</span>
            <h3>朝のブリーフィング</h3>
            <p>
              毎朝7時、今日の予定とタスク、天気をまとめてLINEでお知らせ。<br />
              最高の1日のスタートをサポートします。
            </p>
          </div>
          <div class="card-box">
            <span class="icon">🔍</span>
            <h3>文脈検索</h3>
            <p>
              「先週の会議、何決まったっけ？」<br />
              キーワードを覚えていなくても、AIが文脈を理解して過去のメモから回答します。
            </p>
          </div>
        </div>
      </section>

      <section id="s5">
        <p class="fade-in-up primary-text">START FREE</p>
        <h1 class="fade-in-up delay-100 section-title">
          あなたの脳を、<br />アップデートしよう。
        </h1>

        <p class="fade-in-up delay-200 description" style="margin-bottom: 30px">
          基本的な機能はすべて無料で使えます。<br />
          ランチ1回分の課金で、AIの記憶力や提案力が劇的に進化します。
        </p>

        <div class="fade-in-up delay-300 badge-wrapper">
          <div class="pulse-badge">🚀 ベータ版につき完全無料</div>
        </div>

        <button @click="goToLogin" class="btn-primary fade-in-up delay-400">
          今すぐ秘書を雇う
        </button>

        <div class="fade-in-up delay-500 footer-container">
          <div class="flex gap-4 text-xs text-slate-500 mb-2 justify-center">
            <router-link
              to="/privacy"
              class="hover:text-white transition underline"
              >プライバシーポリシー</router-link
            >
            <router-link
              to="/legal"
              class="hover:text-white transition underline"
              >利用規約</router-link
            >
          </div>
          <p class="footer-text">Designed by Takumi Yoshioka</p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* --- 変数定義 --- */
.lp-container {
  --primary: #6366f1;
  --primary-light: #818cf8;
  --dark: #0f172a;
  --darker: #020617;
  --light: #f8fafc;
  --accent: #f59e0b;
  --text-gray: #94a3b8;

  font-family: "Poppins", "Noto Sans JP", sans-serif;
  background-color: var(--darker);
  color: var(--light);
  overflow-x: hidden;
  width: 100%;
  min-height: 100vh;
}

/* --- スクロール設定 --- */
.slides-container {
  width: 100%;
  height: 100vh;
  overflow-y: scroll;
  scroll-snap-type: y mandatory;
  scroll-behavior: smooth;
}

section {
  width: 100%;
  min-height: 100vh;
  scroll-snap-align: start;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 4rem 1rem;
  box-sizing: border-box;
  overflow: hidden;
}

/* --- テキストスタイル --- */
h1 {
  font-size: clamp(2rem, 6vw, 3.5rem);
  font-weight: 900;
  line-height: 1.3;
  margin-bottom: 1.5rem;
  background: linear-gradient(135deg, #fff 0%, var(--primary-light) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-align: center;
  z-index: 1;
  word-break: keep-all;
  padding: 0 10px;
}

h2 {
  font-size: 1rem;
  color: var(--primary);
  text-transform: uppercase;
  letter-spacing: 0.2em;
  margin-bottom: 1rem;
  z-index: 1;
  font-weight: bold;
}

.subtitle {
  letter-spacing: 0.15em;
  color: var(--primary-light);
  font-weight: bold;
  margin-bottom: 1rem;
  font-size: 0.8rem;
  text-align: center;
}

.description {
  font-size: 1rem;
  color: var(--text-gray);
  max-width: 600px;
  width: 100%;
  text-align: center;
  line-height: 1.8;
  z-index: 1;
  margin-bottom: 2rem;
  padding: 0 1rem;
}

.primary-text {
  color: var(--primary);
  font-weight: bold;
  margin-bottom: 0.5rem;
}

/* --- ロゴ --- */
.logo-wrapper {
  margin-bottom: 20px;
}
.lp-logo {
  border-radius: 20px;
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.5);
}

/* --- 背景装飾 --- */
.bg-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.15;
  z-index: 0;
  width: 80vw;
  height: 80vw;
  max-width: 500px;
  max-height: 500px;
  pointer-events: none;
}
.primary-blob {
  top: -10%;
  left: -10%;
  background: var(--primary);
}
.accent-blob {
  top: 40%;
  right: -20%;
  background: #ec4899;
}

/* --- スマホモック --- */
.mock-wrapper {
  margin-top: 20px;
  position: relative;
  z-index: 5;
  width: 100%;
  display: flex;
  justify-content: center;
}

.phone {
  width: 280px;
  height: 560px;
  background: #1e293b;
  border-radius: 40px;
  border: 8px solid #334155;
  position: relative;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

@media (max-width: 400px) {
  .phone {
    width: 240px;
    height: 480px;
    border-width: 6px;
  }
}

.notch {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 40%;
  height: 25px;
  background: #334155;
  border-bottom-left-radius: 16px;
  border-bottom-right-radius: 16px;
  z-index: 10;
}
.screen {
  flex: 1;
  background: #0f172a;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 15px;
  padding-top: 40px;
}
.line-header {
  text-align: center;
  font-size: 0.8rem;
  font-weight: bold;
  color: #94a3b8;
  padding-bottom: 10px;
  border-bottom: 1px solid #1e293b;
  margin-bottom: 15px;
}
.calendar-widget {
  margin-top: auto;
  background: #fff;
  padding: 10px;
  border-radius: 12px;
  color: #333;
}
.cal-header {
  font-size: 0.7rem;
  color: #666;
  margin-bottom: 5px;
  font-weight: bold;
}
.cal-grid {
  display: flex;
  gap: 10px;
  align-items: center;
}
.cal-time {
  font-size: 0.7rem;
  color: #999;
}
.cal-event {
  background: #e0e7ff;
  border-left: 3px solid var(--primary);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.7rem;
  color: #333;
  flex: 1;
}

/* --- チャットバブル --- */
.chat-bubble {
  padding: 10px 14px;
  border-radius: 18px;
  font-size: 0.75rem;
  margin-bottom: 10px;
  max-width: 90%;
  line-height: 1.5;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}
.chat-user {
  background-color: #06c755;
  color: white;
  align-self: flex-end;
  border-top-right-radius: 4px;
}
.chat-ai {
  background-color: #1e293b;
  border: 1px solid #334155;
  color: #e2e8f0;
  align-self: flex-start;
  border-top-left-radius: 4px;
}

/* --- グリッドレイアウト --- */
.grid-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  width: 100%;
  max-width: 1000px;
  margin-top: 40px;
  z-index: 2;
  padding: 0 1rem;
}

.card-box {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.05);
  padding: 30px 20px;
  border-radius: 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  transition: transform 0.3s;
}

.highlight-box {
  border-color: var(--primary);
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.2);
}
.icon {
  font-size: 2.5rem;
  margin-bottom: 15px;
}
.card-box h3 {
  font-size: 1.2rem;
  color: #fff;
  margin-bottom: 10px;
  font-weight: bold;
}
.card-box p {
  font-size: 0.9rem;
  color: #cbd5e1;
  line-height: 1.6;
}

/* --- 機能リスト --- */
.feature-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 30px;
  width: 100%;
  max-width: 600px;
  z-index: 2;
}
.feature-item {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  background: rgba(255, 255, 255, 0.03);
  padding: 20px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}
.f-icon-box {
  font-size: 2rem;
  background: rgba(255, 255, 255, 0.05);
  width: 60px;
  height: 60px;
  border-radius: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.f-text h3 {
  font-size: 1rem;
  color: var(--primary-light);
  margin-bottom: 5px;
  font-weight: bold;
}
.f-text p {
  font-size: 0.85rem;
  color: #cbd5e1;
  margin: 0;
  line-height: 1.6;
}

/* --- ボタン --- */
.btn-primary {
  background: var(--primary);
  color: white;
  font-weight: bold;
  padding: 1rem 3rem;
  border-radius: 50px;
  border: none;
  cursor: pointer;
  font-size: 1.1rem;
  transition: all 0.3s;
  box-shadow: 0 0 30px rgba(99, 102, 241, 0.4);
  z-index: 10;
  margin-bottom: 30px;
}
.btn-primary:hover {
  transform: scale(1.05);
  box-shadow: 0 0 50px rgba(99, 102, 241, 0.6);
  background: #4f46e5;
}

/* --- バッジ --- */
.pulse-badge {
  background: var(--accent);
  color: white;
  padding: 8px 24px;
  border-radius: 50px;
  font-weight: bold;
  font-size: 0.9rem;
  animation: pulse 2s infinite;
  margin-bottom: 20px;
  text-align: center;
  display: inline-block;
}
@keyframes pulse {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7);
  }
  70% {
    transform: scale(1.05);
    box-shadow: 0 0 0 10px rgba(245, 158, 11, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0);
  }
}

/* --- アニメーション & Footer --- */
.fade-in-up {
  opacity: 0;
  animation: fadeInUp 0.8s ease-out forwards;
}
.delay-100 {
  animation-delay: 0.1s;
}
.delay-200 {
  animation-delay: 0.2s;
}
.delay-300 {
  animation-delay: 0.3s;
}
.delay-400 {
  animation-delay: 0.4s;
}
.delay-500 {
  animation-delay: 0.5s;
}
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.nav-hint {
  position: fixed;
  bottom: 20px;
  right: 20px;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.3);
  z-index: 100;
}
.footer-container {
  margin-top: 50px;
}
.footer-text {
  font-size: 0.8rem;
  opacity: 0.5;
}
</style>
