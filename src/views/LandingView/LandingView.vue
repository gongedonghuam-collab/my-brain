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
            width="60"
            height="60"
            class="lp-logo fade-in-up"
          />
        </div>

        <p class="fade-in-up subtitle">ZUBORA AI ASSISTANT</p>
        <h1 class="fade-in-up delay-100">
          LINEに投げるだけ。<br />勝手にスケジュール管理。
        </h1>
        <p class="fade-in-up delay-200 description">
          カレンダー入力、タスク管理、メモの整理。<br />
          面倒なことは全部、AIに丸投げしよう。
        </p>

        <button @click="goToLogin" class="btn-primary fade-in-up delay-300">
          無料で使い始める
        </button>

        <div class="fade-in-up delay-500 mock-wrapper">
          <div class="phone">
            <div class="notch"></div>
            <div class="screen">
              <div class="line-header">My Brain (LINE)</div>
              <div class="chat-bubble chat-user">
                明日の19時に美容室の予約入れて！
              </div>
              <div class="chat-bubble chat-ai">
                了解です！<br />
                📅 <strong>明日 19:00 美容室</strong><br />
                Googleカレンダーに登録しました✅
              </div>
              <div class="calendar-widget">
                <div class="cal-event">19:00 ✂️ 美容室</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="s2">
        <h2 class="fade-in-up">The Problem</h2>
        <h1 class="fade-in-up delay-100 section-title">
          その予定、<br />入力するの面倒じゃない？
        </h1>

        <div class="problem-grid fade-in-up delay-200">
          <div class="problem-card">
            <span class="icon">😫</span>
            <h3>アプリを開くのがダルい</h3>
            <p>
              カレンダーアプリを起動して、<br />日付を選んで、時間を入力して...<br />その数タップが面倒くさい。
            </p>
          </div>
          <div class="problem-card">
            <span class="icon">🗑️</span>
            <h3>メモがゴミ屋敷</h3>
            <p>
              とりあえずスクショ、とりあえずメモ。<br />
              でも見返さないし、<br />どこにあるか分からない。
            </p>
          </div>
        </div>
      </section>

      <section id="s3">
        <div class="bg-blob accent-blob"></div>

        <h2 class="fade-in-up">Solution</h2>
        <h1 class="fade-in-up delay-100 section-title">
          LINEなら、<br />3秒で終わります。
        </h1>
        <p class="fade-in-up delay-200 description">
          いつも使っているLINEで、友達に送る感覚で。<br />
          裏側でAIが完璧に整理整頓します。
        </p>

        <div class="solution-row fade-in-up delay-300">
          <div class="feature-box">
            <span class="icon">💬</span>
            <span class="feature-title">LINE連携</span>
            <span class="feature-desc">会話で操作</span>
          </div>
          <div class="feature-box highlight-box">
            <span class="icon">📅</span>
            <span class="feature-title highlight-text">自動登録</span>
            <span class="feature-desc">カレンダーへ</span>
          </div>
          <div class="feature-box">
            <span class="icon">🧠</span>
            <span class="feature-title">完全記憶</span>
            <span class="feature-desc">忘れても大丈夫</span>
          </div>
        </div>
      </section>

      <section id="s4">
        <h2 class="fade-in-up">Magic</h2>
        <h1 class="fade-in-up delay-100 section-title">
          「直前カンペ」が<br />あなたを救う。
        </h1>

        <div class="ai-features fade-in-up delay-200">
          <div class="ai-card" style="width: 100%; max-width: 400px">
            <div class="ai-icon">🔔</div>
            <h3>予定の直前に、AIからLINE通知</h3>
            <p style="margin-top: 10px; font-weight: bold; color: #fff">
              「まもなく 14:00 佐藤さんと打ち合わせ」
            </p>
            <div
              style="
                background: rgba(255, 255, 255, 0.1);
                padding: 10px;
                border-radius: 8px;
                margin-top: 10px;
                font-size: 0.8rem;
              "
            >
              🧠 <strong>AIカンペ:</strong><br />
              先週のメモによると、佐藤さんは「新しいWebサイトのデザイン案」を楽しみにしています。前回の予算は50万円で合意済みです。
            </div>
            <p style="margin-top: 10px; font-size: 0.8rem">
              ↑ 過去のメモから必要な情報をAIが勝手に探して教えてくれます。
            </p>
          </div>
        </div>
      </section>

      <section id="s5">
        <p class="fade-in-up primary-text">FREE BETA</p>
        <h1 class="fade-in-up delay-100 section-title">
          もう、覚えるのをやめよう。
        </h1>

        <div class="fade-in-up delay-200 badge-wrapper">
          <div class="pulse-badge">🚀 開発中につき完全無料</div>
        </div>

        <button @click="goToLogin" class="btn-primary fade-in-up delay-300">
          My Brain をはじめる
        </button>

        <div class="fade-in-up delay-500 footer-container">
          <p class="footer-text">Designed by Takumi Yoshioka</p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* 基本設定は維持しつつ、LINE風デザインなどを追加 */
.lp-container {
  --primary: #06c755; /* LINE Green */
  --primary-light: #4ade80;
  --dark: #0f172a;
  --darker: #020617;
  --light: #f8fafc;
  --accent: #3b82f6;
  --text-gray: #94a3b8;

  font-family: "Poppins", "Noto Sans JP", sans-serif;
  background-color: var(--darker);
  color: var(--light);
  overflow-x: hidden;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

/* ... (共通スタイルは既存のまま) ... */
.slides-container {
  width: 100vw;
  height: 100vh;
  overflow-y: scroll;
  scroll-snap-type: y mandatory;
  scroll-behavior: smooth;
}

section {
  width: 100vw;
  height: 100vh;
  min-height: 600px;
  scroll-snap-align: start;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 1rem;
  overflow: hidden;
}

/* LINE風画面の調整 */
.line-header {
  background: #202b3c;
  color: white;
  padding: 10px;
  text-align: center;
  font-size: 0.8rem;
  font-weight: bold;
  border-bottom: 1px solid #333;
}

.calendar-widget {
  margin-top: 10px;
  background: white;
  color: #333;
  padding: 8px;
  border-radius: 8px;
  font-size: 0.7rem;
  font-weight: bold;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
}
.cal-event {
  border-left: 3px solid #06c755;
  padding-left: 5px;
}

/* 他のCSSは既存のものを引き継ぎつつ、色味を調整 */
.bg-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.2;
  z-index: 0;
  width: 500px;
  height: 500px;
}
.primary-blob {
  top: -10%;
  left: -10%;
  background: var(--primary);
}
.accent-blob {
  top: 50%;
  right: -10%;
  background: var(--accent);
}

h1 {
  font-size: clamp(2rem, 5vw, 3.5rem);
  font-weight: 900;
  line-height: 1.2;
  margin-bottom: 1rem;
  background: linear-gradient(135deg, #fff 0%, var(--primary-light) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-align: center;
  z-index: 1;
}

h2 {
  font-size: 1rem;
  color: var(--primary);
  text-transform: uppercase;
  letter-spacing: 0.2em;
  margin-bottom: 1rem;
  z-index: 1;
}

p {
  font-size: 1rem;
  color: var(--text-gray);
  max-width: 600px;
  text-align: center;
  line-height: 1.6;
  z-index: 1;
}

/* ボタン */
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
  box-shadow: 0 0 20px rgba(6, 199, 85, 0.4);
  margin-top: 30px;
  z-index: 10;
}
.btn-primary:hover {
  transform: scale(1.05);
  box-shadow: 0 0 30px rgba(6, 199, 85, 0.6);
}

/* モックアップ */
.mock-wrapper {
  margin-top: 40px;
  position: relative;
}
.phone {
  width: 260px;
  height: 520px;
  background: #76879d; /* LINE talk bg color-ish */
  border-radius: 40px;
  border: 8px solid #334155;
  position: relative;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 2;
}
.notch {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 120px;
  height: 25px;
  background: #334155;
  border-bottom-left-radius: 16px;
  border-bottom-right-radius: 16px;
  z-index: 10;
}
.screen {
  flex: 1;
  background: #7289da; /* LINE background-ish */
  background: linear-gradient(180deg, #1e252f 0%, #171d25 100%);
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  color: white;
  padding: 20px;
  padding-top: 40px;
}

.chat-bubble {
  padding: 12px 16px;
  border-radius: 16px;
  font-size: 0.8rem;
  margin-bottom: 10px;
  max-width: 85%;
  line-height: 1.5;
  position: relative;
}
.chat-user {
  background-color: #06c755;
  color: white;
  align-self: flex-end;
  border-top-right-radius: 4px;
}
.chat-ai {
  background-color: #2c3e50;
  border: 1px solid #334155;
  color: white;
  align-self: flex-start;
  border-top-left-radius: 4px;
}

/* Feature Grid */
.problem-grid,
.solution-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 20px;
  margin-top: 40px;
  z-index: 2;
}
.problem-card,
.feature-box,
.ai-card {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 20px;
  border-radius: 20px;
  text-align: center;
  width: 160px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
.ai-card {
  width: auto;
  max-width: 90%;
}

.icon,
.ai-icon {
  font-size: 2.5rem;
  margin-bottom: 10px;
}
.feature-title {
  font-weight: bold;
  margin-bottom: 5px;
}
.feature-desc {
  font-size: 0.7rem;
  opacity: 0.7;
}
.highlight-box {
  border-color: var(--primary);
  box-shadow: 0 0 15px rgba(6, 199, 85, 0.2);
}
.highlight-text {
  color: var(--primary-light);
}

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

.pulse-badge {
  background: var(--accent);
  color: white;
  padding: 8px 20px;
  border-radius: 50px;
  font-weight: bold;
  font-size: 0.9rem;
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
  }
}
.nav-hint {
  position: fixed;
  bottom: 20px;
  right: 20px;
  font-size: 0.8rem;
  opacity: 0.5;
  z-index: 100;
}
</style>
