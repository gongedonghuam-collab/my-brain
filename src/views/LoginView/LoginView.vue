<script setup lang="ts">
import { ref } from "vue";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { useRouter } from "vue-router";

const router = useRouter();
const isLoginMode = ref(true);
const email = ref("");
const password = ref("");
const loading = ref(false);

const handleSubmit = async () => {
  if (!email.value || !password.value) return alert("入力してください");
  loading.value = true;
  const auth = getAuth();
  const db = getFirestore();

  try {
    if (isLoginMode.value) {
      await signInWithEmailAndPassword(auth, email.value, password.value);
      router.push("/");
    } else {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.value,
        password.value,
      );
      await setDoc(doc(db, "users", userCredential.user.uid), {
        email: email.value,
        createdAt: new Date(),
      });
      router.push("/");
    }
  } catch (e: any) {
    alert(e.message);
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
                ? "脳に接続 (ログイン)"
                : "脳を作成 (新規登録)"
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
