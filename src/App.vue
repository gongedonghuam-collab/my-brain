<script setup lang="ts">
/**
 * App.vue - ルートコンポーネント
 * アプリ全体で常に実行しておきたい処理（ログイン監視、テーマ監視など）はここに記述します。
 * <router-view /> の部分に、URLに応じた各ページが表示されます。
 */
import { onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useMyBrain } from "@/composables/useMyBrain";
import { useTheme } from "@/composables/useTheme";

const { initAuth, currentUser } = useMyBrain();
const { initTheme, cleanupTheme } = useTheme();
const router = useRouter();

/**
 * アプリ起動時の処理
 */
onMounted(() => {
  // Firebaseの認証監視をスタート
  // (ユーザーがログイン中かチェックし、データを読み込む)
  initAuth();

  // 時間帯によるダークモード/ライトモードの自動切替を監視スタート
  initTheme();
});

/**
 * アプリ終了時（コンポーネント破棄時）の処理
 */
onUnmounted(() => {
  // タイマーなどを停止してメモリリークを防ぐ
  cleanupTheme();
});

/**
 * ユーザー情報の監視
 * ログアウトされた場合や、セッションが切れた場合に
 * 自動的にログイン画面へリダイレクトさせます。
 */
watch(currentUser, (newUser) => {
  if (newUser === null) {
    // ログイン不要なページ（LPや規約など）以外にいる場合は、ログイン画面へ飛ばす
    const publicPages = ["/", "/login", "/legal", "/verify-email", "/privacy"];
    if (!publicPages.includes(router.currentRoute.value.path)) {
      router.push("/login");
    }
  }
});
</script>

<template>
  <router-view />
</template>
