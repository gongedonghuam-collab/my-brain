<script setup lang="ts">
import { ref } from "vue";
import { getAuth, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { useRouter } from "vue-router";

const router = useRouter();
const loading = ref(false);
const auth = getAuth();
const db = getFirestore();

// Googleログイン処理
const handleGoogleLogin = async () => {
  loading.value = true;
  try {
    const provider = new GoogleAuthProvider();

    // ★重要: カレンダーへの読み書き権限
    provider.addScope("https://www.googleapis.com/auth/calendar.events");
    provider.addScope("https://www.googleapis.com/auth/calendar.readonly");

    // ★修正: リフレッシュトークンを強制的に取得するための設定
    provider.setCustomParameters({
      prompt: "consent",
      access_type: "offline",
      include_granted_scopes: "true",
    });

    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // フロントエンド用トークン保存
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken;
    if (accessToken) {
      localStorage.setItem("google_calendar_token", accessToken);
    }

    // トークン情報の取得
    const tokenResponse = (result as any)._tokenResponse;
    const refreshToken = tokenResponse?.oauthRefreshToken;

    // ★修正: アクセストークンもDBに保存する（リフレッシュトークンがない場合の保険）
    const tokenData: any = { updatedAt: new Date() };
    if (refreshToken) tokenData.refreshToken = refreshToken;
    if (accessToken) tokenData.accessToken = accessToken; // ★ここを追加

    // どちらか片方でもあれば保存
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
    } else {
      console.warn("No tokens retrieved from Google.");
    }

    // ユーザー情報保存
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
      class="w-full max-w-sm bg-white/5 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/10 flex flex-col items-center"
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

      <div class="w-full space-y-6">
        <p class="text-slate-300 text-sm text-center leading-relaxed mb-4">
          LINEに投げるだけ。<br />
          カレンダーと記憶をAIが勝手に整理。<br />
          <span class="text-indigo-400 font-bold">「予定直前のカンペ通知」</span
          >で<br />
          もう準備はいりません。
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
          Googleで始める
        </button>
      </div>
    </div>
  </div>
</template>
