<script setup lang="ts">
import { useAppHeader } from "./useAppHeader";
import { useMyBrain } from "@/composables/useMyBrain";

const { logout } = useAppHeader();
const { currentUser, startLineAuth, unlinkLine } = useMyBrain(); // ★unlinkLineを追加
</script>

<template>
  <header
    class="h-16 px-6 flex items-center justify-between border-b border-[#27272a] bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-50"
  >
    <div class="flex items-center gap-3">
      <div
        class="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20"
      >
        <span class="text-lg">🧠</span>
      </div>
      <h1 class="font-bold text-lg tracking-tight text-white">My Brain</h1>
    </div>

    <div class="flex items-center gap-2">
      <button
        v-if="currentUser && !currentUser.isLineLinked"
        @click="startLineAuth"
        class="text-xs font-bold bg-[#06c755]/10 text-[#06c755] border border-[#06c755]/20 hover:bg-[#06c755] hover:text-white transition px-3 py-2 rounded-lg flex items-center gap-1.5"
      >
        <span>💬</span>
        <span class="hidden sm:inline">LINE連携</span>
      </button>

      <button
        v-else-if="currentUser && currentUser.isLineLinked"
        @click="unlinkLine"
        class="text-xs font-bold text-[#06c755] bg-[#06c755]/10 px-3 py-2 rounded-lg border border-[#06c755]/20 flex items-center gap-1 hover:bg-[#06c755]/20 transition"
        title="クリックして連携解除"
      >
        <span>💬</span>
        <span class="hidden sm:inline">連携中</span>
        <span class="text-[10px] opacity-50 ml-1">×</span>
      </button>

      <button
        @click="logout"
        class="text-xs font-bold text-slate-400 hover:text-white transition px-3 py-2 hover:bg-[#18181b] rounded-lg"
      >
        ログアウト
      </button>
    </div>
  </header>
</template>
