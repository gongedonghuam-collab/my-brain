<script setup lang="ts">
import { ref } from "vue";
import { getAuth, sendEmailVerification, signOut } from "firebase/auth";
import { useRouter } from "vue-router";

const auth = getAuth();
const router = useRouter();
const user = auth.currentUser;
const loading = ref(false);
const message = ref("");

// 再送信処理
const resendEmail = async () => {
  if (!user) return;
  loading.value = true;
  try {
    await sendEmailVerification(user);
    message.value = "確認メールを再送信しました。";
  } catch (e: any) {
    if (e.code === "auth/too-many-requests") {
      message.value = "少し時間を置いてから再試行してください。";
    } else {
      message.value = "送信に失敗しました。";
    }
  } finally {
    loading.value = false;
  }
};

// 「確認しました」ボタン
const checkVerification = async () => {
  if (!user) return;
  loading.value = true;
  try {
    await user.reload(); // Firebaseの状態を最新に更新
    if (user.emailVerified) {
      alert("認証を確認しました！");
      // ★修正: アプリ画面へ
      router.push("/app");
    } else {
      alert(
        "まだ認証が完了していません。\nメールのリンクをクリックしましたか？",
      );
    }
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
};

const handleLogout = async () => {
  await signOut(auth);
  router.push("/login");
};
</script>

<template>
  <div
    class="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans"
  >
    <div
      class="max-w-md w-full bg-white rounded-3xl p-8 shadow-sm border border-slate-100 text-center"
    >
      <div
        class="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-6"
      >
        ✉️
      </div>

      <h2 class="text-xl font-bold text-slate-800 mb-4">
        メールアドレスの確認
      </h2>

      <p class="text-sm text-slate-600 mb-6 leading-relaxed">
        <strong>{{ user?.email }}</strong> 宛に確認メールを送信しました。<br />
        メール内のリンクをクリックして、アカウントを有効化してください。
      </p>

      <div class="space-y-3">
        <button
          @click="checkVerification"
          :disabled="loading"
          class="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition shadow-lg shadow-blue-200"
        >
          {{ loading ? "確認中..." : "認証完了 (アプリへ進む)" }}
        </button>

        <button
          @click="resendEmail"
          :disabled="loading"
          class="w-full py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition"
        >
          メールを再送信
        </button>
      </div>

      <p
        v-if="message"
        class="mt-4 text-xs text-blue-600 font-bold animate-pulse"
      >
        {{ message }}
      </p>

      <div class="mt-8 pt-6 border-t border-slate-100">
        <p class="text-xs text-slate-400 mb-2">メールが届かない場合</p>
        <p class="text-[10px] text-slate-400">
          ・迷惑メールフォルダをご確認ください<br />
          ・メールアドレスが間違っている場合はログアウトしてやり直してください
        </p>
        <button
          @click="handleLogout"
          class="mt-4 text-xs text-slate-500 underline hover:text-slate-800"
        >
          ログアウト / アドレス変更
        </button>
      </div>
    </div>
  </div>
</template>
