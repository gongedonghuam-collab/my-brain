<script setup lang="ts">
import { ref } from "vue";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendEmailVerification,
} from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import { useRouter } from "vue-router";
import { googleProvider } from "@/../firebase"; // ★修正: 正しいパスに変更

const router = useRouter();
const isLoginMode = ref(true);
const email = ref("");
const password = ref("");
const loading = ref(false);

const auth = getAuth();
const db = getFirestore();

// Googleログイン処理
const handleGoogleLogin = async () => {
  loading.value = true;
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      await setDoc(userRef, {
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        role: "student",
        createdAt: new Date(),
      });
    }

    router.push("/app");
  } catch (e: any) {
    console.error(e);
    alert("Googleログインに失敗しました: " + e.message);
  } finally {
    loading.value = false;
  }
};

// メールログイン処理
const handleSubmit = async () => {
  if (!email.value || !password.value) return alert("入力してください");
  loading.value = true;

  try {
    if (isLoginMode.value) {
      // --- ログイン ---
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.value,
        password.value,
      );
      const user = userCredential.user;

      if (!user.emailVerified) {
        router.push("/verify-email");
      } else {
        router.push("/app");
      }
    } else {
      // --- 新規登録 ---
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.value,
        password.value,
      );
      const user = userCredential.user;

      await setDoc(doc(db, "users", user.uid), {
        email: email.value,
        role: "student",
        createdAt: new Date(),
      });

      await sendEmailVerification(user);
      alert(
        "確認メールを送信しました。\nメール内のリンクをクリックしてください。",
      );
      router.push("/verify-email");
    }
  } catch (e: any) {
    let msg = "エラーが発生しました";
    if (e.code === "auth/email-already-in-use")
      msg = "このメールアドレスは既に登録されています";
    if (e.code === "auth/weak-password")
      msg = "パスワードは6文字以上にしてください";
    if (e.code === "auth/invalid-credential")
      msg = "メールアドレスまたはパスワードが間違っています";
    alert(msg);
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div
    class="min-h-[100dvh] w-full bg-slate-900 flex items-center justify-center p-6"
  >
    <div
      class="w-full max-w-md bg-white/10 backdrop-blur-md rounded-3xl p-8 shadow-2xl border border-white/20"
    >
      <div class="text-center mb-8">
        <h1
          class="text-4xl font-black text-white mb-2 flex justify-center items-center gap-2"
        >
          🧠 My Brain
        </h1>
        <p class="text-slate-400 text-xs font-bold tracking-wider">
          あなただけの第2の脳
        </p>
      </div>

      <div class="space-y-4">
        <button
          @click="handleGoogleLogin"
          :disabled="loading"
          class="w-full bg-white text-slate-700 font-bold py-3 rounded-xl shadow-md hover:bg-slate-50 transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <img
            src="https://www.svgrepo.com/show/475656/google-color.svg"
            class="w-5 h-5"
            alt="Google"
          />
          Googleで{{ isLoginMode ? "ログイン" : "登録" }}
        </button>

        <div class="flex items-center gap-2 my-4">
          <div class="h-px bg-slate-700 flex-1"></div>
          <span class="text-slate-500 text-xs">または</span>
          <div class="h-px bg-slate-700 flex-1"></div>
        </div>

        <div>
          <label class="block text-xs font-bold text-slate-400 mb-1 ml-1"
            >Email</label
          >
          <input
            v-model="email"
            type="email"
            class="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 font-bold text-white outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-400 mb-1 ml-1"
            >Password</label
          >
          <input
            v-model="password"
            type="password"
            class="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 font-bold text-white outline-none focus:ring-2 focus:ring-blue-500 transition"
          />
        </div>

        <button
          @click="handleSubmit"
          :disabled="loading"
          class="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-blue-500 transition active:scale-95 disabled:opacity-50 mt-4"
        >
          {{
            loading
              ? "処理中..."
              : isLoginMode
                ? "メールでログイン"
                : "メールで登録"
          }}
        </button>

        <div class="text-center mt-6">
          <button
            @click="isLoginMode = !isLoginMode"
            class="text-xs font-bold text-slate-400 hover:text-white transition"
          >
            {{ isLoginMode ? "アカウント作成はこちら" : "ログインはこちら" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
