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
            width="50"
            height="50"
            class="lp-logo fade-in-up"
          />
        </div>

        <p class="fade-in-up subtitle">AI KNOWLEDGE BASE</p>
        <h1 class="fade-in-up delay-100">
          あなたの記憶を、<br />AIが拡張する。
        </h1>
        <p class="fade-in-up delay-200 description">
          忘れても大丈夫。あなただけの「第2の脳」がここにあります。
        </p>

        <button @click="goToLogin" class="btn-primary fade-in-up delay-300">
          今すぐ始める
        </button>

        <div class="fade-in-up delay-500 mock-wrapper">
          <div class="phone">
            <div class="notch"></div>
            <div class="screen">
              <div class="screen-header">My Brain</div>
              <div class="chat-bubble chat-user">
                先週の会議で決まったA社の予算っていくらだっけ？
              </div>
              <div class="chat-bubble chat-ai">
                先週木曜日のメモによると、A社の予算は「300万円（税抜）」で承認されています。<br /><br />関連資料：<br />📄
                240115_議事録.pdf
              </div>
              <div class="chat-bubble chat-user">ありがとう！助かった。</div>
            </div>
          </div>
        </div>
      </section>

      <section id="s2">
        <h2 class="fade-in-up">The Problem</h2>
        <h1 class="fade-in-up delay-100 section-title">
          脳の容量、足りてますか？
        </h1>

        <div class="problem-grid fade-in-up delay-200">
          <div class="problem-card">
            <span class="icon">🌫️</span>
            <h3>思い出せない</h3>
            <p>
              「あの件、どうなったっけ？」<br />大事な情報を忘れてしまい、<br />信頼を失う恐怖。
            </p>
          </div>
          <div class="problem-card">
            <span class="icon">🔍</span>
            <h3>見つからない</h3>
            <p>
              LINE、Slack、メモ帳...<br />情報が散らばりすぎて、<br />検索に時間を浪費する毎日。
            </p>
          </div>
          <div class="problem-card">
            <span class="icon">🤯</span>
            <h3>整理できない</h3>
            <p>
              情報はインプットするだけ。<br />整理する時間がなく、<br />知識として定着しない。
            </p>
          </div>
        </div>
      </section>

      <section id="s3">
        <div class="bg-blob accent-blob"></div>

        <h2 class="fade-in-up">Solution</h2>
        <h1 class="fade-in-up delay-100 section-title">
          放り込むだけで、整理完了。
        </h1>
        <p class="fade-in-up delay-200 description">
          My
          Brainは、あらゆる情報を一元管理し、AIがあなたの思考をサポートします。
        </p>

        <div class="solution-row fade-in-up delay-300">
          <div class="feature-box">
            <span class="icon">📝</span>
            <span class="feature-title">メモ・画像</span>
            <span class="feature-desc">何でも保存</span>
          </div>
          <div class="feature-box">
            <span class="icon">🌐</span>
            <span class="feature-title">Web保存</span>
            <span class="feature-desc">URL貼るだけ</span>
          </div>
          <div class="feature-box highlight-box">
            <span class="icon">🤖</span>
            <span class="feature-title highlight-text">AI検索</span>
            <span class="feature-desc">会話で思い出す</span>
          </div>
        </div>
      </section>

      <section id="s4">
        <h2 class="fade-in-up">AI Core</h2>
        <h1 class="fade-in-up delay-100 section-title">
          ただの検索じゃない。<br />文脈を理解する「対話」です。
        </h1>

        <div class="ai-features fade-in-up delay-200">
          <div class="ai-card">
            <div class="ai-icon">🧠</div>
            <h3>曖昧な記憶でOK</h3>
            <p>
              「先月の飲み会で話題になった映画なんだっけ？」のような、キーワードを覚えていなくてもAIが推測して答えます。
            </p>
          </div>
          <div class="ai-card">
            <div class="ai-icon">📊</div>
            <h3>構造化・図解</h3>
            <p>
              複雑な情報は、AIが自動でマインドマップや表に変換。視覚的に理解を助けます。
            </p>
          </div>
        </div>
      </section>

      <section id="s5">
        <p class="fade-in-up primary-text">FREE ACCESS</p>
        <h1 class="fade-in-up delay-100 section-title">
          あなたの脳を、アップデートしよう。
        </h1>

        <div class="fade-in-up delay-200 badge-wrapper">
          <div class="pulse-badge">🚀 ベータ版につき完全無料</div>
        </div>

        <button @click="goToLogin" class="btn-primary fade-in-up delay-300">
          My Brain を開く
        </button>

        <div class="fade-in-up delay-500 footer-container">
          <div class="legal-links">
            <router-link to="/legal" class="legal-link"
              >特定商取引法に基づく表記</router-link
            >
          </div>
          <p class="footer-text">Designed by Takumi Yoshioka</p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* スコープ付きCSS */
.lp-container {
  --primary: #3b82f6;
  --primary-light: #60a5fa;
  --dark: #0f172a;
  --darker: #020617;
  --light: #f8fafc;
  --accent: #8b5cf6;
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
  min-height: 550px; /* 最小高さをさらに縮小 */
  scroll-snap-align: start;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 0.5rem; /* パディングを極限まで減らす */
  overflow: hidden;
}

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

.logo-wrapper {
  margin-bottom: 5px; /* マージン極小 */
}
.lp-logo {
  border-radius: 12px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
}

h1 {
  /* フォントサイズを縮小して1行に収まりやすくする */
  font-size: clamp(1.8rem, 4vw, 3rem);
  font-weight: 900;
  line-height: 1.1;
  margin-bottom: 0.5rem;
  background: linear-gradient(135deg, #fff 0%, var(--primary-light) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-align: center;
  z-index: 1;
}

h2 {
  font-size: clamp(1rem, 2.5vw, 1.5rem);
  color: var(--primary);
  text-transform: uppercase;
  letter-spacing: 0.2em;
  margin-bottom: 1rem;
  text-align: center;
  z-index: 1;
}

h3 {
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 0.3rem;
  color: white;
}

p {
  font-size: 0.9rem;
  color: var(--text-gray);
  max-width: 800px;
  text-align: center;
  line-height: 1.5;
  z-index: 1;
}

.subtitle {
  letter-spacing: 0.15em;
  color: var(--primary-light);
  font-weight: bold;
  margin-bottom: 0.5rem;
  font-size: 0.7rem;
}
.description {
  font-size: 0.9rem;
  color: var(--text-gray);
}
.section-title {
  font-size: clamp(1.8rem, 4vw, 2.5rem);
  margin-bottom: 1.5rem;
}
.primary-text {
  color: var(--primary);
  font-weight: bold;
}

/* フッター調整 */
.footer-container {
  margin-top: 30px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.legal-links {
  margin-bottom: 5px;
}
.legal-link {
  color: var(--text-gray);
  font-size: 0.7rem;
  text-decoration: underline;
  transition: color 0.3s;
}
.legal-link:hover {
  color: white;
}
.footer-text {
  font-size: 0.6rem;
  opacity: 0.4;
}

/* アニメーション */
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

/* スマホモック */
.mock-wrapper {
  margin-top: 20px;
  position: relative;
}
.phone {
  /* スマホサイズを大幅に縮小 */
  width: 180px;
  height: 380px;
  background: #0f172a;
  border-radius: 24px;
  border: 5px solid #334155;
  position: relative;
  box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 2;
  transform: rotate(-3deg) translateY(0px); /* 傾きと位置調整 */
}
.notch {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 80px;
  height: 18px;
  background: #334155;
  border-bottom-left-radius: 10px;
  border-bottom-right-radius: 10px;
  z-index: 10;
}
.screen {
  flex: 1;
  background: #020617;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  color: white;
  padding: 10px;
}
.screen-header {
  margin-top: 25px;
  font-weight: 900;
  font-size: 0.9rem;
  text-align: center;
  margin-bottom: 10px;
}

/* チャット */
.chat-bubble {
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 0.6rem;
  margin-bottom: 6px;
  max-width: 90%;
  line-height: 1.4;
  text-align: left;
}
.chat-user {
  background-color: #1e293b;
  align-self: flex-end;
  border-top-right-radius: 4px;
}
.chat-ai {
  background-color: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #bfdbfe;
  align-self: flex-start;
  border-top-left-radius: 4px;
}

/* カード類 */
.problem-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  width: 100%;
  max-width: 800px;
  margin-top: 20px;
  z-index: 2;
}
.problem-card {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 15px;
  border-radius: 16px;
  text-align: center;
  transition: transform 0.3s;
}
.problem-card:hover {
  transform: translateY(-5px);
  background: rgba(255, 255, 255, 0.05);
}
.icon {
  font-size: 2rem;
  margin-bottom: 0.5rem;
  display: block;
}

.solution-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 15px;
  margin-top: 20px;
  z-index: 2;
}
.feature-box {
  width: 110px;
  height: 110px;
  background: linear-gradient(145deg, #1e293b, #0f172a);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 5px 10px -3px rgba(0, 0, 0, 0.5);
}
.feature-title {
  font-weight: bold;
  margin-top: 6px;
  font-size: 0.8rem;
}
.feature-desc {
  font-size: 0.55rem;
  opacity: 0.7;
  margin-top: 3px;
}
.highlight-box {
  border-color: var(--primary);
  box-shadow: 0 0 15px rgba(59, 130, 246, 0.3);
}
.highlight-text {
  color: var(--primary-light);
}

.ai-features {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 20px;
}
.ai-card {
  width: 240px;
  background: #1e293b;
  padding: 15px;
  border-radius: 16px;
  border: 1px solid #334155;
}
.ai-icon {
  font-size: 1.5rem;
  margin-bottom: 6px;
}
.ai-card h3 {
  font-size: 1rem;
  margin-bottom: 0.3rem;
}
.ai-card p {
  font-size: 0.75rem;
  text-align: left;
  margin-bottom: 0;
}

.btn-primary {
  background: var(--primary);
  color: white;
  font-weight: bold;
  padding: 0.6rem 2rem;
  border-radius: 50px;
  text-decoration: none;
  font-size: 1rem;
  transition: all 0.3s;
  box-shadow: 0 0 15px rgba(59, 130, 246, 0.5);
  margin-top: 15px;
  display: inline-block;
  border: none;
  cursor: pointer;
}
.btn-primary:hover {
  transform: scale(1.05);
  box-shadow: 0 0 25px rgba(59, 130, 246, 0.8);
}

.badge-wrapper {
  margin: 15px 0;
}
.pulse-badge {
  background: var(--accent);
  color: white;
  padding: 5px 12px;
  border-radius: 50px;
  font-weight: bold;
  margin-bottom: 5px;
  display: inline-block;
  font-size: 0.8rem;
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
  bottom: 15px;
  right: 15px;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.3);
  z-index: 100;
}
</style>
