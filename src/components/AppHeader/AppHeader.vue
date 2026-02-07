<script setup lang="ts">
import { useAppHeader } from "./useAppHeader";
import { useMyBrain } from "@/composables/useMyBrain";
import NotificationBell from "@/components/NotificationBell/NotificationBell.vue";

const { logout } = useAppHeader();
// startSubscription: 課金画面へ飛ばす関数
const { currentUser, startLineAuth, unlinkLine, startSubscription } =
  useMyBrain();
</script>

<template>
  <header
    class="h-16 px-4 md:px-6 flex items-center justify-between border-b border-[#27272a] bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-50"
  >
    <div class="flex items-center gap-3">
      <div
        class="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20"
      >
        <span class="text-lg">🧠</span>
      </div>
      <h1 class="font-bold text-lg tracking-tight text-white hidden md:block">
        My Brain
      </h1>
    </div>

    <div class="flex items-center gap-2 md:gap-4">
      <div
        v-if="currentUser && !currentUser.isPro"
        class="flex items-center gap-2 mr-2"
      >
        <div
          class="text-[10px] md:text-xs font-bold text-slate-400 bg-slate-800/50 px-2 py-1 rounded-md border border-slate-700"
        >
          あと {{ 5 - (currentUser.dailyUsage || 0) }} 回
        </div>
        <button
          @click="startSubscription"
          class="text-[10px] md:text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-600 text-white px-3 py-1.5 rounded-full shadow-lg shadow-orange-500/20 hover:scale-105 transition animate-pulse-slow"
        >
          💎 Proにする
        </button>
      </div>

      <div v-else-if="currentUser && currentUser.isPro" class="mr-2">
        <span
          class="text-[10px] font-bold text-amber-400 border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 rounded"
          >PRO Plan</span
        >
      </div>

      <NotificationBell />

      <button
        v-if="currentUser && !currentUser.isLineLinked"
        @click="startLineAuth"
        class="text-xs font-bold bg-[#06c755]/10 text-[#06c755] border border-[#06c755]/20 hover:bg-[#06c755] hover:text-white transition px-2 md:px-3 py-2 rounded-lg flex items-center gap-1.5"
        title="LINE連携"
      >
        <span class="text-lg">💬</span>
        <span class="hidden md:inline">LINE連携</span>
      </button>

      <button
        v-else-if="currentUser && currentUser.isLineLinked"
        @click="unlinkLine"
        class="text-xs font-bold text-[#06c755] bg-[#06c755]/10 px-2 md:px-3 py-2 rounded-lg border border-[#06c755]/20 flex items-center gap-1 hover:bg-[#06c755]/20 transition"
        title="連携解除"
      >
        <span class="text-lg">💬</span>
        <span class="text-[10px] opacity-50 -ml-1">×</span>
      </button>

      <button
        @click="logout"
        class="text-slate-400 hover:text-white transition p-2 hover:bg-[#18181b] rounded-lg"
        title="ログアウト"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" x2="9" y1="12" y2="12" />
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
/* ゆっくり点滅するアニメーション（Proボタン用） */
.animate-pulse-slow {
  animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.8;
  }
}
</style>
