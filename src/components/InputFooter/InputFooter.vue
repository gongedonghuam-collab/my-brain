<script setup lang="ts">
import { computed } from "vue";
import { useInputFooter } from "./useInputFooter";
import { useMyBrain } from "@/composables/useMyBrain";

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

const { currentUser, startSubscription, isSaving, isAiThinking, isSpeaking } =
  useMyBrain();

const remainingCount = computed(() =>
  currentUser.value?.isPro ? 9999 : 5 - (currentUser.value?.dailyUsage || 0),
);
</script>

<template>
  <footer
    class="fixed bottom-0 w-full bg-slate-900/95 backdrop-blur-md border-t border-slate-800 p-4 pb-8 z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]"
  >
    <div class="max-w-md mx-auto relative">
      <div
        v-if="isSaving || isAiThinking || isSpeaking"
        class="absolute -top-16 left-0 right-0 flex justify-center"
      >
        <div
          class="bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg font-bold text-xs flex items-center gap-2 animate-pulse"
        >
          <span class="text-lg">{{
            isSpeaking ? "🗣️" : isSaving ? "🧠" : "🤖"
          }}</span>
          {{
            isSpeaking
              ? "読み上げ中..."
              : isSaving
                ? "脳に書き込み中..."
                : "AIが思考中..."
          }}
        </div>
      </div>

      <div class="flex items-center justify-between px-2 mb-3">
        <div class="text-[10px] font-bold text-slate-400">
          <span
            v-if="currentUser?.isPro"
            class="text-yellow-400 flex items-center gap-1"
            >👑 PRO Plan</span
          >
          <span v-else
            >Free: 残り
            <span
              :class="remainingCount === 0 ? 'text-red-500' : 'text-white'"
              >{{ remainingCount }}</span
            >
            / 5回</span
          >
        </div>

        <div class="flex flex-col items-end gap-1">
          <button
            v-if="!currentUser?.isPro"
            @click="startSubscription"
            class="text-[10px] bg-gradient-to-r from-indigo-500 to-purple-500 text-white px-3 py-1 rounded-full font-bold shadow hover:opacity-90 transition"
          >
            🚀 PROへ (¥1,000)
          </button>

          <router-link
            to="/legal"
            class="text-[9px] text-slate-500 hover:text-slate-300 transition underline"
          >
            特定商取引法に基づく表記
          </router-link>
        </div>
      </div>

      <div
        class="flex bg-slate-800 p-1 rounded-xl mb-3 relative overflow-hidden"
      >
        <div
          class="absolute top-1 bottom-1 bg-white/10 rounded-lg transition-all duration-300 ease-out"
          :style="{
            left:
              inputMode === 'memo'
                ? '2px'
                : inputMode === 'url'
                  ? '25%'
                  : inputMode === 'chat'
                    ? '50%'
                    : '75%',
            width: 'calc(25% - 4px)',
          }"
        ></div>
        <button
          @click="inputMode = 'memo'"
          :class="[
            'flex-1 py-2 text-xs font-bold rounded-lg relative z-10 transition',
            inputMode === 'memo' ? 'text-white' : 'text-slate-400',
          ]"
        >
          📝 メモ
        </button>
        <button
          @click="inputMode = 'url'"
          :class="[
            'flex-1 py-2 text-xs font-bold rounded-lg relative z-10 transition',
            inputMode === 'url' ? 'text-green-400' : 'text-slate-400',
          ]"
        >
          🌐 URL
        </button>
        <button
          @click="inputMode = 'chat'"
          :class="[
            'flex-1 py-2 text-xs font-bold rounded-lg relative z-10 transition',
            inputMode === 'chat' ? 'text-blue-400' : 'text-slate-400',
          ]"
        >
          🔍 会話
        </button>
        <button
          @click="inputMode = 'calendar'"
          :class="[
            'flex-1 py-2 text-xs font-bold rounded-lg relative z-10 transition',
            inputMode === 'calendar' ? 'text-orange-400' : 'text-slate-400',
          ]"
        >
          📅 予定
        </button>
      </div>

      <div
        v-if="selectedFiles.length > 0"
        class="relative mb-2 flex gap-2 overflow-x-auto pb-2 scrollbar-hide animate-fade-in"
      >
        <div
          v-for="(preview, index) in filePreviews"
          :key="index"
          class="relative flex-shrink-0"
        >
          <img
            :src="preview"
            class="h-20 w-20 rounded-lg border border-slate-600 object-cover"
          />
        </div>
        <div
          v-for="(file, index) in selectedFiles.slice(filePreviews.length)"
          :key="'file' + index"
          class="relative flex-shrink-0"
        >
          <div
            class="h-20 w-20 bg-slate-800 rounded-lg border border-slate-600 flex flex-col items-center justify-center p-2"
          >
            <span class="text-2xl">📄</span>
            <span
              class="text-[8px] text-slate-400 truncate w-full text-center mt-1"
              >{{ file.name }}</span
            >
          </div>
        </div>

        <button
          @click="clearFiles"
          class="absolute top-0 right-0 bg-slate-700 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs border border-slate-500 shadow-lg z-10"
        >
          ×
        </button>
      </div>

      <div class="relative flex items-end gap-2">
        <div v-if="inputMode === 'memo'" class="flex-shrink-0">
          <input
            type="file"
            ref="fileInputRef"
            accept="image/*,application/pdf,text/plain,audio/*"
            class="hidden"
            multiple
            @change="handleFileSelect"
          />
          <button
            @click="fileInputRef?.click()"
            class="w-10 h-10 flex items-center justify-center bg-slate-800 rounded-xl text-slate-400 hover:text-white transition"
          >
            📎
          </button>
        </div>

        <div v-if="inputMode === 'chat'" class="flex-shrink-0">
          <button
            @click="toggleListening"
            class="w-10 h-10 flex items-center justify-center rounded-xl transition border"
            :class="
              isListening
                ? 'bg-red-500/20 text-red-500 border-red-500 animate-pulse'
                : 'bg-slate-800 text-slate-400 border-transparent hover:text-white'
            "
          >
            🎙️
          </button>
        </div>

        <textarea
          v-model="inputText"
          rows="3"
          class="flex-1 bg-slate-800 border border-slate-700 text-white rounded-2xl py-3 px-4 outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed text-sm"
          :placeholder="
            isListening
              ? 'お話しください...'
              : inputMode === 'url'
                ? 'https://...'
                : inputMode === 'memo'
                  ? '何を記憶しますか？'
                  : inputMode === 'calendar'
                    ? 'カレンダーを見ながらメモ...'
                    : 'AIに質問...'
          "
          @input="handleInput"
          @keydown.enter.ctrl="handleSend(inputMode as any)"
        ></textarea>

        <button
          @click="handleSend(inputMode as any)"
          :disabled="
            (!inputText && selectedFiles.length === 0) ||
            isSaving ||
            isAiThinking
          "
          class="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-blue-600 rounded-full text-white disabled:opacity-50 disabled:bg-slate-700 transition shadow-lg self-end mb-1"
        >
          ↑
        </button>
      </div>
    </div>
  </footer>
</template>
