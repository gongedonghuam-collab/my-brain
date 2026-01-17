<script setup lang="ts">
// ロジックファイルを読み込む
import { useAppHeader } from "./useAppHeader";

// ログアウト機能を取り出す
const { logout } = useAppHeader();
</script>

<template>
  <header
    class="h-14 px-4 flex items-center justify-between border-b border-slate-800 bg-slate-900/50 backdrop-blur z-20"
  >
    <div class="font-black text-lg tracking-tight">🧠 My Brain</div>

    <button
      @click="logout"
      class="text-xs font-bold text-slate-500 hover:text-white transition"
    >
      ログアウト
    </button>
  </header>
</template>
