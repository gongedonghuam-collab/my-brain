<script setup lang="ts">
import { useAppHeader } from "./useAppHeader";

// ★あなたのLINEログインチャンネルIDを入れてください
const LINE_LOGIN_CHANNEL_ID = "2008915242";
const REDIRECT_URI = window.location.origin + "/app";

const startLineLogin = () => {
  // LINEの認証画面へ飛ばすURL
  const url = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${LINE_LOGIN_CHANNEL_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=randomstate123&scope=profile%20openid`;
  window.location.href = url;
};

const { logout } = useAppHeader();
</script>

<template>
  <header
    class="h-14 px-4 flex items-center justify-between border-b border-slate-800 bg-slate-900/50 backdrop-blur z-20"
  >
    <div class="font-black text-lg tracking-tight">🧠 My Brain</div>

    <div class="flex items-center gap-3">
      <button
        @click="startLineLogin"
        class="text-[10px] bg-[#06C755] text-white px-3 py-1.5 rounded-full font-bold hover:opacity-90 transition flex items-center gap-1"
      >
        <span>💬</span> LINE連携
      </button>

      <button
        @click="logout"
        class="text-xs font-bold text-slate-500 hover:text-white transition"
      >
        ログアウト
      </button>
    </div>
  </header>
</template>
