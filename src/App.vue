<script setup lang="ts">
import { onMounted } from "vue";
import { useMyBrain } from "@/composables/useMyBrain";

const { initAuth } = useMyBrain();

onMounted(() => {
  initAuth(); // 認証監視スタート
});
</script>

<template>
  <router-view />
</template>
