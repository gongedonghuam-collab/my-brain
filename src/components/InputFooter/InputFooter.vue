<script setup lang="ts">
import { computed } from "vue";
import { useInputFooter } from "./useInputFooter";

const props = defineProps<{
  modelValue: "memo" | "chat" | "url";
}>();

const emit = defineEmits<{
  (e: "update:modelValue", val: "memo" | "chat" | "url"): void;
}>();

const inputMode = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

// ★修正: 第2引数を削除
const {
  inputText,
  selectedFile,
  filePreview,
  fileInputRef,
  isListening,
  isAiThinking,
  toggleListening,
  handleFileSelect,
  clearFile,
  handleSend,
} = useInputFooter(props.modelValue);
</script>

<template>
  <footer
    class="fixed bottom-0 w-full bg-slate-900/90 backdrop-blur border-t border-slate-800 p-4 pb-8 z-30 transition-all"
  >
    <div class="max-w-md mx-auto">
      <div
        class="flex gap-2 mb-4 justify-center bg-slate-800 p-1 rounded-full w-fit mx-auto"
      >
        <button
          @click="inputMode = 'memo'"
          class="text-xs font-bold px-4 py-2 rounded-full transition"
          :class="
            inputMode === 'memo'
              ? 'bg-white text-slate-900'
              : 'text-slate-400 hover:text-white'
          "
        >
          📝 メモ
        </button>
        <button
          @click="inputMode = 'url'"
          class="text-xs font-bold px-4 py-2 rounded-full transition"
          :class="
            inputMode === 'url'
              ? 'bg-green-500 text-white'
              : 'text-slate-400 hover:text-white'
          "
        >
          🌐 URL
        </button>
        <button
          @click="inputMode = 'chat'"
          class="text-xs font-bold px-4 py-2 rounded-full transition"
          :class="
            inputMode === 'chat'
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-white'
          "
        >
          🔍 会話
        </button>
      </div>

      <div
        v-if="selectedFile"
        class="relative mb-2 inline-block animate-fade-in"
      >
        <img
          v-if="filePreview"
          :src="filePreview"
          class="h-20 rounded-lg border border-slate-600"
        />
        <div
          v-else
          class="h-20 w-20 bg-slate-800 rounded-lg border border-slate-600 flex flex-col items-center justify-center p-2"
        >
          <span class="text-2xl">📄</span>
          <span
            class="text-[8px] text-slate-400 truncate w-full text-center mt-1"
            >{{ selectedFile.name }}</span
          >
        </div>
        <button
          @click="clearFile"
          class="absolute -top-2 -right-2 bg-slate-700 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs border border-slate-500"
        >
          ×
        </button>
      </div>

      <div class="relative flex items-end gap-2">
        <button
          @click="toggleListening"
          class="w-10 h-10 flex items-center justify-center rounded-xl transition shadow-lg relative overflow-hidden"
          :class="
            isListening
              ? 'bg-red-500 text-white animate-pulse'
              : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
          "
        >
          <span class="relative z-10">{{ isListening ? "■" : "🎙️" }}</span>
          <div
            v-if="isListening"
            class="absolute inset-0 bg-red-600 animate-ping opacity-75"
          ></div>
        </button>

        <div v-if="inputMode === 'memo'">
          <input
            type="file"
            ref="fileInputRef"
            accept="image/*, application/pdf, text/plain"
            class="hidden"
            @change="handleFileSelect"
          />
          <button
            @click="fileInputRef?.click()"
            class="w-10 h-10 flex items-center justify-center bg-slate-800 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            📎
          </button>
        </div>

        <textarea
          v-model="inputText"
          rows="1"
          class="flex-1 bg-slate-800 border border-slate-700 text-white rounded-2xl py-3 px-4 outline-none focus:ring-2 focus:ring-blue-500 resize-none overflow-hidden"
          :placeholder="
            inputMode === 'url'
              ? 'URLを入力...'
              : inputMode === 'memo'
                ? '記憶...'
                : '質問...'
          "
          @keydown.enter.prevent="handleSend(inputMode)"
        ></textarea>

        <button
          @click="handleSend(inputMode)"
          :disabled="(!inputText && !selectedFile) || isAiThinking"
          class="w-10 h-10 flex items-center justify-center bg-blue-600 rounded-full text-white disabled:opacity-50 disabled:bg-slate-700 transition shadow-lg"
        >
          ↑
        </button>
      </div>
    </div>
  </footer>
</template>
