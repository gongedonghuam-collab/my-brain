<script setup lang="ts">
import { onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useMyBrain } from "@/composables/useMyBrain";
import { useTheme } from "@/composables/useTheme"; // 追加

const { initAuth, currentUser } = useMyBrain();
const { initTheme, cleanupTheme } = useTheme(); // 追加
const router = useRouter();

onMounted(() => {
  initAuth();
  initTheme(); // テーマ監視開始
});

onUnmounted(() => {
  cleanupTheme();
});

watch(currentUser, (newUser) => {
  if (newUser === null) {
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
