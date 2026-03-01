<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { useRouter } from "vue-router";

const router = useRouter();
const loading = ref(false);
const auth = getAuth();
const db = getFirestore();

// アプリ内ブラウザ関連のフラグ
const isInAppBrowser = ref(false);
const showBrowserGuidance = ref(false); // ★ガイダンス画面を出すフラグ

onMounted(() => {
  const ua = navigator.userAgent.toLowerCase();
  if (
    ua.indexOf("line/") > -1 ||
    ua.indexOf("instagram") > -1 ||
    ua.indexOf("tiktok") > -1 ||
    ua.indexOf("fbav") > -1 ||
    ua.indexOf("fban") > -1
  ) {
    isInAppBrowser.value = true;
  }
});

const handleLoginSuccess = async (result: any) => {
  const user = result.user;
  const tokenResponse = result._tokenResponse;
  const refreshToken =
    tokenResponse?.oauthRefreshToken || tokenResponse?.refreshToken;
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken;
  const expiresIn = tokenResponse?.expiresIn || 3600;

  const tokenData: any = { updatedAt: new Date() };

  if (accessToken) {
    tokenData.accessToken = accessToken;
    localStorage.setItem("google_calendar_token", accessToken);
    const expiryTime = new Date().getTime() + (Number(expiresIn) - 300) * 1000;
    localStorage.setItem("google_calendar_token_expiry", expiryTime.toString());
  }
  if (refreshToken) {
    tokenData.refreshToken = refreshToken;
  }
  if (refreshToken || accessToken) {
    try {
      await setDoc(doc(db, "users", user.uid, "system", "tokens"), tokenData, {
        merge: true,
      });
    } catch (e) {
      console.error("Token save error:", e);
    }
  }

  await setDoc(
    doc(db, "users", user.uid),
    {
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      lastLogin: new Date(),
    },
    { merge: true },
  );

  router.push("/app");
};

const handleGoogleLogin = async () => {
  // ★TikTokなどであれば、ログイン処理はせず「ブラウザで開く案内」を出す！
  if (isInAppBrowser.value) {
    showBrowserGuidance.value = true;
    return;
  }

  // 普通のブラウザなら通常通りログイン処理
  loading.value = true;
  try {
    const provider = new GoogleAuthProvider();
    provider.addScope("https://www.googleapis.com/auth/calendar.events");
    provider.addScope("https://www.googleapis.com/auth/calendar.readonly");
    provider.setCustomParameters({
      prompt: "select_account consent",
      access_type: "offline",
    });

    const result = await signInWithPopup(auth, provider);
    await handleLoginSuccess(result);
  } catch (e: any) {
    console.error(e);
    alert("Googleログインに失敗しました: " + e.message);
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div
    class="min-h-[100dvh] w-full bg-slate-900 flex items-center justify-center p-6 relative overflow-hidden"
  >
    <div
      class="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[100px] pointer-events-none"
    ></div>
    <div
      class="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[100px] pointer-events-none"
    ></div>

    <div
      class="w-full max-w-sm bg-white/5 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/10 flex flex-col items-center relative z-10 overflow-hidden"
    >
      <div class="mb-10 text-center">
        <div class="text-6xl mb-4">🧠</div>
        <h1 class="text-3xl font-black text-white mb-2 tracking-tight">
          My Brain
        </h1>
        <p class="text-slate-400 text-xs font-bold tracking-widest uppercase">
          ズボラ専用 AI秘書
        </p>
      </div>

      <div
        v-if="showBrowserGuidance"
        class="absolute inset-0 bg-slate-900/95 backdrop-blur-md p-6 flex flex-col items-center justify-center text-center z-50 animate-fade-in border border-indigo-500/50"
      >
        <div class="text-5xl mb-4 animate-bounce">↗️</div>
        <h2 class="text-lg font-bold text-white mb-2">ブラウザで開いてね！</h2>
        <p class="text-[11px] text-slate-300 mb-6 leading-relaxed">
          TikTok等のアプリ内では、<br />Googleのセキュリティ設定により<br />ログインがブロックされてしまいます💦
        </p>
        <div
          class="bg-indigo-600 text-white rounded-xl p-4 text-xs font-bold w-full mb-6 shadow-lg shadow-indigo-600/30 text-left"
        >
          ① 右上の
          <span class="text-xl inline-block mx-1">⋯</span> などをタップ<br />
          ②「ブラウザで開く」を選択<br />
          ③ いつものブラウザでログイン！
        </div>
        <button
          @click="showBrowserGuidance = false"
          class="text-xs text-slate-400 underline hover:text-white p-2"
        >
          戻る
        </button>
      </div>

      <div
        v-else-if="loading"
        class="w-full flex flex-col items-center justify-center py-6"
      >
        <div
          class="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"
        ></div>
        <p class="text-slate-400 text-xs font-bold">Googleと通信中...</p>
      </div>

      <div v-else class="w-full space-y-6">
        <p class="text-slate-300 text-sm text-center leading-relaxed mb-4">
          LINEで全てを完結させるために、<br />
          <span class="text-indigo-400 font-bold">Google連携</span>
          が必要です。<br />
          <span class="text-xs text-slate-500"
            >※一度連携すれば、あとはログイン不要です。</span
          >
        </p>

        <button
          @click="handleGoogleLogin"
          :disabled="loading"
          class="w-full bg-white text-slate-900 font-bold py-4 rounded-xl shadow-lg hover:bg-slate-50 transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 group"
        >
          <svg
            class="w-5 h-5 group-hover:scale-110 transition-transform"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Googleで連携する
        </button>

        <div class="mt-6 flex justify-center gap-4 text-[10px] text-slate-500">
          <router-link
            to="/privacy"
            class="hover:text-slate-300 transition underline"
            >プライバシーポリシー</router-link
          >
          <span class="text-slate-700">|</span>
          <router-link
            to="/legal"
            class="hover:text-slate-300 transition underline"
            >利用規約</router-link
          >
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
