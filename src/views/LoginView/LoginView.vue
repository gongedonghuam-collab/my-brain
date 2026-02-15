<script setup lang="ts">
import { ref, onMounted } from "vue";
import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { useRouter } from "vue-router";

// ルーター（画面遷移）と認証機能の準備
const router = useRouter();
const loading = ref(false); // ローディング中かどうか
const auth = getAuth(); // Firebase Auth
const db = getFirestore(); // Firestore Database

// アプリ内ブラウザ判定フラグ
const isInAppBrowser = ref(false);

onMounted(() => {
  // ★重要: LINE, Instagram, TikTok, Facebook を検知
  const ua = navigator.userAgent.toLowerCase();
  if (
    ua.includes("line") ||
    ua.includes("instagram") ||
    ua.includes("tiktok") ||
    ua.includes("fbav") // Facebook
  ) {
    isInAppBrowser.value = true;
  }
});

const handleGoogleLogin = async () => {
  // アプリ内ブラウザならアラートを出して中断
  if (isInAppBrowser.value) {
    alert("右上のメニューから「ブラウザで開く」を選択してください🙇‍♂️");
    return;
  }

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
    const user = result.user;

    const tokenResponse = (result as any)._tokenResponse;
    const refreshToken =
      tokenResponse?.oauthRefreshToken || tokenResponse?.refreshToken;
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;
    const expiresIn = tokenResponse?.expiresIn || 3600;

    const tokenData: any = { updatedAt: new Date() };

    if (accessToken) {
      tokenData.accessToken = accessToken;
      localStorage.setItem("google_calendar_token", accessToken);
      const expiryTime =
        new Date().getTime() + (Number(expiresIn) - 300) * 1000;
      localStorage.setItem(
        "google_calendar_token_expiry",
        expiryTime.toString(),
      );
    }

    if (refreshToken) {
      tokenData.refreshToken = refreshToken;
    }

    if (refreshToken || accessToken) {
      try {
        await setDoc(
          doc(db, "users", user.uid, "system", "tokens"),
          tokenData,
          { merge: true },
        );
        console.log("Tokens saved successfully.");
      } catch (saveError: any) {
        console.error("Token save error:", saveError);
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
      class="w-full max-w-sm bg-white/5 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/10 flex flex-col items-center relative z-10"
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
        v-if="isInAppBrowser"
        class="w-full bg-amber-600 rounded-xl p-6 text-white text-center shadow-lg animate-pulse mb-6 border-2 border-white"
      >
        <div class="text-4xl mb-2">⚠️</div>
        <h2 class="font-bold text-lg mb-2">ブラウザで開いてください</h2>
        <p class="text-sm leading-relaxed opacity-90 font-bold">
          TikTokやインスタのままでは<br />
          Googleログインができません💦
        </p>
        <div
          class="mt-4 p-3 bg-black/30 rounded-lg text-xs font-bold text-left"
        >
          ① 右上の「・・・」や「矢印」を押す<br />
          ②「ブラウザで開く」を選択<br />
          ③ SafariやChromeで開けばOK！
        </div>
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
