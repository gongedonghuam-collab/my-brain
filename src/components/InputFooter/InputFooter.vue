<script setup lang="ts">
import { computed } from "vue";
import { useInputFooter } from "./useInputFooter";
import { useMyBrain } from "@/composables/useMyBrain";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getApp } from "firebase/app";

const props = defineProps<{
  modelValue: "memo" | "chat" | "url" | "calendar";
}>();
const emit = defineEmits<{
  (e: "update:modelValue", val: "memo" | "chat" | "url" | "calendar"): void;
}>();

const inputMode = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

const {
  inputText,
  selectedFiles,
  filePreviews,
  fileInputRef,
  handleFileSelect,
  clearFiles,
  handleSend,
  isListening,
  toggleListening,
  handleInput,
} = useInputFooter(inputMode);

const { currentUser, isSaving, isAiThinking, isSpeaking } = useMyBrain();

// バイブレーション
const haptic = () => {
  if (navigator.vibrate) navigator.vibrate(10);
};

// ★修正: フロントエンドにあるトークンを直接渡す
const testNotification = async () => {
  if (!confirm("【動画撮影用】\nLINEにテスト通知を強制送信しますか？")) return;

  const functions = getFunctions(getApp(), "asia-northeast1");
  const func = httpsCallable(functions, "forceTriggerNotification");

  // ★ここが根本解決の鍵: ブラウザが持っている「有効な鍵」を渡す
  const localToken = localStorage.getItem("google_calendar_token");

  try {
    const res: any = await func({ accessToken: localToken });
    if (res.data.result) {
      alert("結果: " + res.data.result);
    }
  } catch (e: any) {
    console.error(e);
    alert("失敗: " + e.message);
  }
};
</script>

<template>
  <footer class="fixed bottom-0 w-full z-40 pointer-events-none">
    <div
      class="absolute bottom-0 w-full h-40 bg-gradient-to-t from-[#09090b] via-[#09090b]/95 to-transparent"
    ></div>

    <div class="max-w-xl mx-auto px-4 pb-6 relative pointer-events-auto">
      <div
        v-if="isSaving || isAiThinking || isSpeaking"
        class="flex justify-center mb-4"
      >
        <div
          class="bg-indigo-600/90 backdrop-blur text-white px-4 py-1.5 rounded-full shadow-lg font-bold text-xs flex items-center gap-2 animate-pulse border border-indigo-400/30"
        >
          <span class="text-sm">{{
            isSpeaking ? "🗣️" : isSaving ? "🧠" : "✨"
          }}</span>
          {{
            isSpeaking
              ? "読み上げ中..."
              : isSaving
                ? "処理中..."
                : "AIが思考中..."
          }}
        </div>
      </div>

      <div
        class="bg-[#18181b] border border-[#27272a] rounded-[32px] shadow-2xl overflow-hidden transition-all duration-300 focus-within:border-indigo-500/50"
      >
        <div class="flex p-1 gap-1 overflow-x-auto scrollbar-hide">
          <button
            v-for="mode in ['memo', 'chat', 'url', 'calendar']"
            :key="mode"
            @click="
              inputMode = mode as any;
              haptic();
            "
            class="flex-1 py-2 rounded-full text-[10px] font-bold transition whitespace-nowrap text-center relative"
            :class="
              inputMode === mode
                ? 'text-white'
                : 'text-slate-500 hover:text-slate-300'
            "
          >
            <span
              v-if="inputMode === mode"
              class="absolute inset-0 bg-[#27272a] rounded-full -z-10"
            ></span>
            {{
              mode === "memo"
                ? "Memo"
                : mode === "chat"
                  ? "Chat"
                  : mode === "url"
                    ? "URL"
                    : "Schedule"
            }}
          </button>
        </div>

        <div
          v-if="selectedFiles.length > 0"
          class="flex gap-2 overflow-x-auto px-4 pb-2"
        >
          <div
            v-for="(preview, idx) in filePreviews"
            :key="idx"
            class="relative group"
          >
            <img
              :src="preview"
              class="h-14 w-14 rounded-lg object-cover border border-[#27272a]"
            />
            <button
              @click="clearFiles"
              class="absolute -top-1 -right-1 bg-slate-800 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] border border-slate-600"
            >
              ×
            </button>
          </div>
        </div>

        <div class="flex items-end gap-2 px-3 pb-3 pt-1">
          <div v-if="inputMode === 'memo'" class="pb-1.5">
            <input
              type="file"
              ref="fileInputRef"
              class="hidden"
              multiple
              @change="handleFileSelect"
              accept="image/*"
            />
            <button
              @click="
                fileInputRef?.click();
                haptic();
              "
              class="p-2 text-slate-400 hover:text-white hover:bg-[#27272a] rounded-full transition"
            >
              📎
            </button>
          </div>

          <div class="pb-1.5 flex gap-1">
            <button
              @click="testNotification"
              class="p-2 text-slate-500 hover:text-white hover:bg-[#27272a] rounded-full transition"
              title="【撮影用】テスト通知を送る"
            >
              🔔
            </button>

            <button
              v-if="inputMode === 'chat'"
              @click="
                toggleListening;
                haptic();
              "
              class="p-2 rounded-full transition"
              :class="
                isListening
                  ? 'bg-red-500/20 text-red-500 animate-pulse'
                  : 'text-slate-400 hover:text-white hover:bg-[#27272a]'
              "
            >
              🎙️
            </button>
          </div>

          <textarea
            v-model="inputText"
            rows="1"
            class="flex-1 bg-transparent text-white placeholder-slate-600 text-sm py-3 max-h-32 focus:outline-none resize-none"
            :placeholder="
              inputMode === 'chat'
                ? 'AIに指示...(ワンショット入力可)'
                : '記憶、タスク、予定を入力...'
            "
            @input="
              (e) => {
                (e.target as HTMLTextAreaElement).style.height = 'auto';
                (e.target as HTMLTextAreaElement).style.height =
                  (e.target as HTMLTextAreaElement).scrollHeight + 'px';
                handleInput();
              }
            "
            @keydown.enter.ctrl="handleSend(inputMode as any)"
          ></textarea>

          <button
            @click="
              handleSend(inputMode as any);
              haptic();
            "
            :disabled="!inputText && selectedFiles.length === 0"
            class="mb-1 p-2 bg-indigo-600 text-white rounded-full w-9 h-9 flex items-center justify-center hover:bg-indigo-500 active:scale-90 transition disabled:opacity-30 disabled:scale-100 shadow-lg shadow-indigo-500/20"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  </footer>
</template>
