<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from "vue";
import { useMyBrain, type Memory } from "@/composables/useMyBrain";
import mermaid from "mermaid";
import { httpsCallable, getFunctions } from "firebase/functions";
import { getApp } from "firebase/app";
import { useRouter, useRoute } from "vue-router";
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
const showSuccessToast = ref(false);
const route = useRoute();
const router = useRouter();

onMounted(async () => {
  initAuth();
  mermaid.initialize({
    startOnLoad: false,
    theme: "dark",
    securityLevel: "loose",
    suppressErrorRendering: true,
  });

  const code = route.query.code as string;
  if (code) {
    window.history.replaceState({}, document.title, "/app");
    try {
      const functions = getFunctions(getApp(), "asia-northeast1"); // ★リージョン指定
      const linkFunc = httpsCallable(functions, "linkLineAccount");
      await linkFunc({ code, redirectUri: window.location.origin + "/app" });
      showSuccessToast.value = true;
      setTimeout(() => (showSuccessToast.value = false), 5000);
    } catch (e) {
      console.error(e);
      alert("LINE連携に失敗しました");
    }
  }
});

const scrollToBottom = async () => {
  if (inputMode.value !== "chat") return;
  await nextTick();
  setTimeout(() => {
    if (chatContainerRef.value)
      chatContainerRef.value.scrollTo({
        top: chatContainerRef.value.scrollHeight,
        behavior: "smooth",
      });
  }, 100);
};

watch(chatLogs, scrollToBottom, { deep: true });
watch(isAiThinking, scrollToBottom);
watch(inputMode, (newMode) => {
  if (newMode === "chat") {
    nextTick(() => {
      if (chatContainerRef.value)
        chatContainerRef.value.scrollTop = chatContainerRef.value.scrollHeight;
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
  <div
    class="h-screen flex flex-col bg-slate-950 text-slate-200 font-sans relative"
  >
    <Transition name="toast">
      <div
        v-if="showSuccessToast"
        class="absolute top-6 left-1/2 -translate-x-1/2 z-50 bg-green-500 text-white px-6 py-4 rounded-full shadow-2xl flex items-center gap-3 border-2 border-green-400 w-[90%] max-w-sm"
      >
        <span class="text-2xl">✅</span>
        <div>
          <p class="font-bold text-sm">LINE連携完了！</p>
          <p class="text-xs opacity-90">
            公式アカウントにメッセージを送ってみましょう
          </p>
        </div>
      </div>
    </Transition>

    <AppHeader />
    <TagFilter />

    <main
      ref="chatContainerRef"
      class="flex-1 overflow-y-auto p-4 space-y-6 pb-60 scrollbar-hide"
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
.toast-enter-active,
.toast-leave-active {
  transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -20px);
}
</style>
