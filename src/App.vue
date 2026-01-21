<script setup lang="ts">
import { onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useMyBrain } from "@/composables/useMyBrain";

const { initAuth, currentUser } = useMyBrain();
const router = useRouter();

onMounted(() => {
  initAuth(); // 認証監視スタート
});

// ★追加: ユーザー状態を監視し、予期せずログアウト状態になったらログイン画面へ
watch(currentUser, (newUser) => {
  if (newUser === null) {
    // 現在のページが公開ページ（ログイン不要ページ）でなければリダイレクト
    const publicPages = ["/", "/login", "/legal", "/verify-email"];
    if (!publicPages.includes(router.currentRoute.value.path)) {
      router.push("/login");
    }
  }
});
</script>

<template>
  <router-view />
</template>
