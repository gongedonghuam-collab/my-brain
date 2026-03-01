<script setup lang="ts">
import { useRouter } from "vue-router";
import { onMounted, ref } from "vue";

const router = useRouter();
const containerRef = ref<HTMLElement | null>(null);

const goToLogin = () => {
  router.push("/login");
};

// スクロール連動アニメーションの設定
onMounted(() => {
  const observerOptions = {
    root: null,
    rootMargin: "0px",
    threshold: 0.15, // 要素が15%見えたら発火
  };

  const observerCallback = (
    entries: IntersectionObserverEntry[],
    observer: IntersectionObserver,
  ) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target); // 一度表示したら監視を解除
      }
    });
  };

  const observer = new IntersectionObserver(observerCallback, observerOptions);
  const targets = document.querySelectorAll(".js-observe");
  targets.forEach((target) => observer.observe(target));
});
</script>

<template>
  <div class="lp-container" ref="containerRef">
    <div class="nav-hint">Scroll or Use Arrow Keys ↓</div>

    <div class="slides-container" id="container">
      <section id="s1">
        <div class="bg-blob primary-blob"></div>
        <div class="logo-wrapper js-observe fade-in-up">
          <img
            src="/logo.png?v=3"
            width="80"
            height="80"
            class="lp-logo"
            alt="My Brain Logo"
          />
        </div>
        <p class="subtitle js-observe fade-in-up delay-100">
          LINE-BASED AI ASSISTANT
        </p>
        <h1 class="js-observe fade-in-up delay-200">
          LINEがあなたの<br />「第2の脳」になる。
        </h1>
        <p class="description js-observe fade-in-up delay-300">
          カレンダー登録、<strong>リマインダー</strong>、タスク管理、メモの整理。<br />
          面倒なことは全て、LINEに投げ捨てるだけ。<br />
          ズボラなあなたのための、最強のAI秘書です。
        </p>
        <button
          @click="goToLogin"
          class="btn-primary js-observe fade-in-up delay-400"
        >
          今すぐ秘書を雇う (無料)
        </button>

        <div class="mock-wrapper js-observe fade-in-up delay-500">
          <div class="phone">
            <div class="notch"></div>
            <div class="screen">
              <div class="line-header">My Brain (LINE)</div>
              <div class="chat-area">
                <div class="chat-bubble chat-user">
                  明日19時 渋谷で田中さんと焼き鳥！
                </div>
                <div class="chat-bubble chat-ai">
                  <div>承知しました！登録完了です🫡</div>
                  <div class="event-card">
                    <div class="event-badge">SCHEDULED</div>
                    <div class="event-title">19:00 田中さんと焼き鳥</div>
                    <div class="event-detail">📍 渋谷</div>
                    <div class="event-weather">☔ 雨予報 (60%)</div>
                  </div>
                </div>

                <div class="chat-bubble chat-user">3分後にカップ麺教えて</div>
                <div class="chat-bubble chat-ai">
                  ⏰ リマインダーをセットしました<br />
                  3分後に「カップ麺」とお知らせします。
                </div>
              </div>

              <div class="calendar-widget">
                <div class="cal-header">
                  <span class="cal-icon">📅</span> Google Calendar
                </div>
                <div class="cal-grid">
                  <div class="cal-time">19:00</div>
                  <div class="cal-event">田中さんと焼き鳥</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="s2">
        <h2 class="js-observe fade-in-up">The Pain</h2>
        <h1 class="section-title js-observe fade-in-up delay-100">
          アプリの使い分け、<br />疲れていませんか？
        </h1>
        <div class="grid-container js-observe fade-in-up delay-200">
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
        <h2 class="js-observe fade-in-up">Simple Solution</h2>
        <h1 class="section-title js-observe fade-in-up delay-100">
          LINEひとつで、<br />全て片付きます。
        </h1>
        <p class="description js-observe fade-in-up delay-200">
          新しいアプリを覚える必要はありません。<br />
          いつも使っているLINEで、友達に話すように送るだけです。
        </p>

        <div class="feature-list js-observe fade-in-up delay-300">
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
            <div class="f-icon-box">⏰</div>
            <div class="f-text">
              <h3>リマインドする</h3>
              <p>
                「3分後に教えて」「13時に電話」など、カレンダーに残すまでもない用件もサクッと通知。
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
                「パスワードは〇〇」など、何でも放り込んでOK。AIが必要な時に思い出させてくれます。
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="s4">
        <h2 class="js-observe fade-in-up">Pro Features</h2>
        <h1 class="section-title js-observe fade-in-up delay-100">
          AIだからできる、<br />「気配り」機能。
        </h1>
        <div class="grid-container js-observe fade-in-up delay-200">
          <div class="card-box highlight-box">
            <span class="icon">⏰</span>
            <h3>1秒リマインダー</h3>
            <p>
              「カップ麺3分」「21時に薬」など、LINEに送るだけ。<br />
              指定時刻に通知が届くので、リマインダーアプリとしても優秀です。
            </p>
          </div>
          <div class="card-box">
            <span class="icon">📅</span>
            <h3>自動スケジュール登録</h3>
            <p>
              「明日」「来週」などの言葉もAIが理解。<br />
              Googleカレンダーに即座に反映され、ダブルブッキングも防げます。
            </p>
          </div>
          <div class="card-box">
            <span class="icon">☔</span>
            <h3>天気付きリマインド</h3>
            <p>
              予定の直前と、その日の朝にLINEでお知らせ。<br />
              現地の天気も教えてくれるので傘を忘れません。
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
          <div class="card-box">
            <span class="icon">📷</span>
            <h3>画像も読めます</h3>
            <p>
              書類や手書きメモを写真で送るだけ。<br />
              AIが内容をテキスト化して保存・整理します。
            </p>
          </div>
          <div class="card-box">
            <span class="icon">🌐</span>
            <h3>Web記事要約</h3>
            <p>
              「後で読む」記事のURLを送れば、3行で要約して保存。知識のインプットが加速します。
            </p>
          </div>
        </div>
      </section>

      <section class="how-to js-observe fade-in-up">
        <h2 class="section-subtitle">HOW TO USE</h2>
        <h1 class="section-title">使い方は、驚くほど簡単。</h1>

        <div class="steps">
          <div class="step">
            <div class="step-num">01</div>
            <div class="step-content">
              <h3>アカウント作成 & LINE連携</h3>
              <p>
                Googleアカウントでログインし、あなたのLINEと連携させます。所要時間は約30秒。
              </p>
            </div>
          </div>
          <div class="step">
            <div class="step-num">02</div>
            <div class="step-content">
              <h3>LINEに話しかける</h3>
              <p>
                予定、タスク、リマインド、メモ、愚痴、なんでも送ってください。AIが自動で分類して処理します。
              </p>
            </div>
          </div>
          <div class="step">
            <div class="step-num">03</div>
            <div class="step-content">
              <h3>必要な時に、AIがサポート</h3>
              <p>
                リマインド通知を受け取ったり、「〇〇って何だっけ？」と質問して情報を引き出せます。
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="s5">
        <p class="primary-text js-observe fade-in-up">START FREE</p>
        <h1 class="section-title js-observe fade-in-up delay-100">
          あなたの脳を、<br />アップデートしよう。
        </h1>

        <p
          class="description js-observe fade-in-up delay-200"
          style="margin-bottom: 30px"
        >
          基本的な機能はすべて無料で使えます。<br />
          ランチ1回分の課金で、AIの記憶力や提案力が劇的に進化します。
        </p>

        <div class="badge-wrapper js-observe fade-in-up delay-300"></div>

        <button
          @click="goToLogin"
          class="btn-primary js-observe fade-in-up delay-400"
        >
          今すぐ秘書を雇う
        </button>

        <div class="footer-container js-observe fade-in-up delay-500">
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
  --glass: rgba(255, 255, 255, 0.05);
  --border: rgba(255, 255, 255, 0.1);

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
  scroll-behavior: smooth;
}

section {
  width: 100%;
  min-height: 100vh; /* 最低でも画面いっぱいの高さ */
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 6rem 1rem; /* 上下のパディング */
  box-sizing: border-box;
  overflow: hidden;
}

/* --- テキストスタイル --- */
h1 {
  font-size: clamp(2.5rem, 7vw, 4rem);
  font-weight: 900;
  line-height: 1.2;
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
  font-size: 1.1rem;
  color: var(--primary);
  text-transform: uppercase;
  letter-spacing: 0.2em;
  margin-bottom: 1rem;
  z-index: 1;
  font-weight: bold;
}

.section-title {
  font-size: clamp(2rem, 5vw, 3rem);
  font-weight: 900;
  margin-bottom: 1rem;
  text-align: center;
  background: linear-gradient(135deg, #fff 0%, var(--primary-light) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.section-subtitle {
  text-align: center;
  color: var(--primary);
  font-weight: bold;
  letter-spacing: 0.1em;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
  font-size: 1rem;
}

.subtitle {
  letter-spacing: 0.15em;
  color: var(--primary-light);
  font-weight: bold;
  margin-bottom: 1rem;
  font-size: 0.9rem;
  text-align: center;
}

.description {
  font-size: 1.05rem;
  color: var(--text-gray);
  max-width: 640px;
  width: 100%;
  text-align: center;
  line-height: 1.8;
  z-index: 1;
  margin-bottom: 2.5rem;
  padding: 0 1rem;
}

.primary-text {
  color: var(--primary);
  font-weight: bold;
  margin-bottom: 0.5rem;
  letter-spacing: 0.1em;
}

/* --- ロゴ --- */
.logo-wrapper {
  margin-bottom: 25px;
}
.lp-logo {
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

/* --- 背景装飾 --- */
.bg-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.15;
  z-index: 0;
  width: 80vw;
  height: 80vw;
  max-width: 600px;
  max-height: 600px;
  pointer-events: none;
}
.primary-blob {
  top: -15%;
  left: -15%;
  background: var(--primary);
}
.accent-blob {
  top: 35%;
  right: -25%;
  background: #ec4899;
}

/* --- スマホモック --- */
.mock-wrapper {
  margin-top: 30px;
  position: relative;
  z-index: 5;
  width: 100%;
  display: flex;
  justify-content: center;
  perspective: 1000px;
}

.phone {
  width: 300px;
  height: 600px;
  background: #1e293b;
  border-radius: 44px;
  border: 10px solid #334155;
  position: relative;
  box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.6);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transform: rotateX(5deg);
  transition: transform 0.3s ease;
}
.phone:hover {
  transform: rotateX(0deg) scale(1.02);
}

@media (max-width: 400px) {
  .phone {
    width: 260px;
    height: 520px;
    border-width: 8px;
  }
}

.notch {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 35%;
  height: 28px;
  background: #334155;
  border-bottom-left-radius: 18px;
  border-bottom-right-radius: 18px;
  z-index: 10;
}
.screen {
  flex: 1;
  background: #0f172a;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
}
.line-header {
  text-align: center;
  font-size: 0.85rem;
  font-weight: bold;
  color: #94a3b8;
  padding: 45px 0 15px;
  background: rgba(15, 23, 42, 0.9);
  backdrop-filter: blur(5px);
  border-bottom: 1px solid #1e293b;
  position: absolute;
  top: 0;
  width: 100%;
  z-index: 2;
}
.chat-area {
  padding: 80px 15px 15px;
  flex: 1;
  overflow-y: auto;
}

/* --- チャットバブル & イベントカード --- */
.chat-bubble {
  padding: 12px 16px;
  border-radius: 20px;
  font-size: 0.8rem;
  margin-bottom: 12px;
  max-width: 88%;
  line-height: 1.5;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
}
.chat-user {
  background: linear-gradient(135deg, #06c755, #05b34d);
  color: white;
  align-self: flex-end;
  border-top-right-radius: 4px;
  margin-left: auto;
}
.chat-ai {
  background-color: #1e293b;
  border: 1px solid #334155;
  color: #e2e8f0;
  align-self: flex-start;
  border-top-left-radius: 4px;
}
.event-card {
  margin-top: 10px;
  padding: 12px;
  background-color: #2d3748;
  border-radius: 12px;
  border: 1px solid #4a5568;
}
.event-badge {
  font-size: 0.65rem;
  color: var(--primary-light);
  font-weight: bold;
  margin-bottom: 4px;
  letter-spacing: 0.05em;
}
.event-title {
  font-size: 0.9rem;
  font-weight: bold;
  color: #fff;
  margin-bottom: 4px;
}
.event-detail {
  font-size: 0.75rem;
  color: #a0aec0;
}
.event-weather {
  font-size: 0.75rem;
  color: #63b3ed;
  margin-top: 6px;
  font-weight: bold;
}

/* --- カレンダーウィジェット --- */
.calendar-widget {
  margin-top: auto;
  background: rgba(255, 255, 255, 0.95);
  padding: 15px;
  border-top-left-radius: 24px;
  border-top-right-radius: 24px;
  color: #333;
  box-shadow: 0 -5px 20px rgba(0, 0, 0, 0.1);
  transform: translateY(100%);
  animation: slideUp 0.5s ease-out 0.8s forwards;
}
@keyframes slideUp {
  to {
    transform: translateY(0);
  }
}

.cal-header {
  font-size: 0.75rem;
  color: #555;
  margin-bottom: 10px;
  font-weight: bold;
  display: flex;
  align-items: center;
}
.cal-icon {
  margin-right: 6px;
  font-size: 1rem;
}
.cal-grid {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 5px 0;
}
.cal-time {
  font-size: 0.75rem;
  color: #888;
  font-weight: bold;
}
.cal-event {
  background: #eef2ff;
  border-left: 4px solid var(--primary);
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 0.8rem;
  color: #1f2937;
  flex: 1;
  font-weight: bold;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
}

/* --- グリッドレイアウト --- */
.grid-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 25px;
  width: 100%;
  max-width: 1100px;
  margin-top: 50px;
  z-index: 2;
  padding: 0 1rem;
}

.card-box {
  background: rgba(255, 255, 255, 0.02);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 35px 25px;
  border-radius: 28px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  transition: all 0.3s ease;
}
.card-box:hover {
  background: rgba(255, 255, 255, 0.05);
  transform: translateY(-8px);
  border-color: rgba(255, 255, 255, 0.15);
}

.highlight-box {
  border-color: var(--primary-light);
  box-shadow: 0 0 25px rgba(99, 102, 241, 0.15);
  background: rgba(99, 102, 241, 0.03);
}
.highlight-box:hover {
  border-color: var(--primary);
  box-shadow: 0 0 35px rgba(99, 102, 241, 0.25);
}

.icon {
  font-size: 3rem;
  margin-bottom: 20px;
  filter: drop-shadow(0 5px 10px rgba(0, 0, 0, 0.2));
}
.card-box h3 {
  font-size: 1.25rem;
  color: #fff;
  margin-bottom: 12px;
  font-weight: bold;
}
.card-box p {
  font-size: 0.95rem;
  color: #cbd5e1;
  line-height: 1.7;
}

/* --- 機能リスト --- */
.feature-list {
  display: flex;
  flex-direction: column;
  gap: 25px;
  margin-top: 40px;
  width: 100%;
  max-width: 700px;
  z-index: 2;
}
.feature-item {
  display: flex;
  align-items: center;
  gap: 25px;
  background: rgba(255, 255, 255, 0.02);
  padding: 25px;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: all 0.3s ease;
}
.feature-item:hover {
  background: rgba(255, 255, 255, 0.05);
  transform: translateX(5px);
  border-color: rgba(255, 255, 255, 0.15);
}

.f-icon-box {
  font-size: 2.2rem;
  background: rgba(255, 255, 255, 0.07);
  width: 70px;
  height: 70px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--primary-light);
}
.f-text h3 {
  font-size: 1.1rem;
  color: #fff;
  margin-bottom: 8px;
  font-weight: bold;
}
.f-text p {
  font-size: 0.9rem;
  color: #cbd5e1;
  margin: 0;
  line-height: 1.7;
}

/* --- 使い方 (How to) --- */
.how-to {
  background: rgba(0, 0, 0, 0.2);
  width: 100%;
}
.steps {
  display: flex;
  flex-direction: column;
  gap: 30px;
  max-width: 800px;
  margin: 50px auto 0;
  width: 100%;
}
.step {
  display: flex;
  align-items: center;
  gap: 30px;
  background: rgba(255, 255, 255, 0.03);
  padding: 30px;
  border-radius: 24px;
  border: 1px solid var(--border);
  transition: transform 0.3s ease;
}
.step:hover {
  transform: translateX(10px);
  background: rgba(255, 255, 255, 0.05);
}
.step-num {
  font-size: 3rem;
  font-weight: 900;
  color: var(--primary);
  opacity: 0.8;
  min-width: 60px;
  text-align: center;
  line-height: 1;
}
.step-content h3 {
  font-size: 1.2rem;
  margin-bottom: 8px;
  color: #fff;
  font-weight: bold;
}
.step-content p {
  font-size: 0.95rem;
  color: var(--text-gray);
  line-height: 1.6;
}
@media (max-width: 600px) {
  .step {
    flex-direction: column;
    text-align: center;
    gap: 15px;
  }
}

/* --- ボタン --- */
.btn-primary {
  background: linear-gradient(135deg, var(--primary) 0%, #4f46e5 100%);
  color: white;
  font-weight: bold;
  padding: 1.1rem 3.5rem;
  border-radius: 50px;
  border: none;
  cursor: pointer;
  font-size: 1.15rem;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 10px 30px -5px rgba(99, 102, 241, 0.5);
  z-index: 10;
  margin-bottom: 35px;
  position: relative;
  overflow: hidden;
}
.btn-primary::before {
  content: "";
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.2),
    transparent
  );
  transition: left 0.5s;
}
.btn-primary:hover {
  transform: translateY(-3px);
  box-shadow: 0 15px 35px -5px rgba(99, 102, 241, 0.6);
}
.btn-primary:hover::before {
  left: 100%;
}
.btn-primary:active {
  transform: translateY(-1px);
  box-shadow: 0 5px 15px rgba(99, 102, 241, 0.4);
}

/* --- バッジ --- */
.badge-wrapper {
  margin-bottom: 25px;
}
.pulse-badge {
  background: linear-gradient(135deg, var(--accent), #e67e22);
  color: white;
  padding: 10px 28px;
  border-radius: 50px;
  font-weight: bold;
  font-size: 0.95rem;
  animation: pulse 2.5s infinite;
  text-align: center;
  display: inline-block;
  box-shadow: 0 5px 15px rgba(245, 158, 11, 0.3);
}
@keyframes pulse {
  0% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.6);
  }
  50% {
    transform: scale(1.03);
    box-shadow: 0 0 0 15px rgba(245, 158, 11, 0);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(245, 158, 11, 0);
  }
}

/* --- アニメーション & Footer (修正) --- */
.js-observe {
  opacity: 0;
  transform: translateY(30px);
  transition:
    opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}
.js-observe.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.delay-100 {
  transition-delay: 0.1s;
}
.delay-200 {
  transition-delay: 0.2s;
}
.delay-300 {
  transition-delay: 0.3s;
}
.delay-400 {
  transition-delay: 0.4s;
}
.delay-500 {
  transition-delay: 0.5s;
}

.footer-container {
  margin-top: 60px;
  text-align: center;
}
.footer-text {
  font-size: 0.85rem;
  opacity: 0.6;
}
</style>
