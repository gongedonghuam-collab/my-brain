<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from "vue";
import { useMyBrain, type Memory } from "@/composables/useMyBrain";
import mermaid from "mermaid";

import AppHeader from "@/components/AppHeader/AppHeader.vue";
import TagFilter from "@/components/TagFilter/TagFilter.vue";
import MemoList from "@/components/MemoList/MemoList.vue";
import ChatList from "@/components/ChatList/ChatList.vue";
import InputFooter from "@/components/InputFooter/InputFooter.vue";
import MemoryModal from "@/components/MemoryModal/MemoryModal.vue";

const { initAuth, chatLogs, isAiThinking } = useMyBrain();

const inputMode = ref<"memo" | "chat" | "url">("memo");
const editingMemory = ref<Memory | null>(null);
const chatContainerRef = ref<HTMLElement | null>(null);

onMounted(() => {
  initAuth();
  // Mermaidの初期設定（エラー抑制）
  mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    securityLevel: "loose",
    suppressErrorRendering: true,
  });
});

// ■ 強制スクロール関数
const scrollToBottom = async () => {
  if (inputMode.value !== "chat") return;

  await nextTick(); // DOM更新待ち
  // 念のため少し待ってからスクロール（画像の読み込みなどを考慮）
  setTimeout(() => {
    if (chatContainerRef.value) {
      chatContainerRef.value.scrollTo({
        top: chatContainerRef.value.scrollHeight,
        behavior: "smooth",
      });
    }
  }, 100);
};

// 1. チャットログが増えたらスクロール
watch(chatLogs, scrollToBottom, { deep: true });

// 2. AI思考開始/終了時もスクロール
watch(isAiThinking, scrollToBottom);

// 3. モード切替時もチャットならスクロール
watch(inputMode, (newMode) => {
  if (newMode === "chat") {
    // 切り替え直後は描画が追いつかないことがあるので、即時と遅延の2回実行
    nextTick(() => {
      if (chatContainerRef.value) {
        chatContainerRef.value.scrollTop = chatContainerRef.value.scrollHeight;
      }
    });
    scrollToBottom();
  }
});

const onOpenDetail = (memo: Memory) => {
  editingMemory.value = memo;
};

const onModeChange = (newMode: "memo" | "chat" | "url") => {
  inputMode.value = newMode;
};
</script>

<template>
  <div class="h-screen flex flex-col bg-slate-950 text-slate-200 font-sans">
    <AppHeader />
    <TagFilter />

    <main
      ref="chatContainerRef"
      class="flex-1 overflow-y-auto p-4 space-y-6 pb-44 scrollbar-hide"
    >
      <MemoList
        v-if="inputMode === 'memo' || inputMode === 'url'"
        @openDetail="onOpenDetail"
      />

      <ChatList v-if="inputMode === 'chat'" />
    </main>

    <MemoryModal :memory="editingMemory" @close="editingMemory = null" />

    <InputFooter :modelValue="inputMode" @update:modelValue="onModeChange" />
  </div>
</template>

<style>
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.animate-pulse-soft {
  animation: pulse-soft 2s infinite;
}
@keyframes pulse-soft {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}
</style>
