<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useMyBrain, type Memory } from "@/composables/useMyBrain";

const {
  currentUser,
  memories,
  chatLogs,
  activeTag, // ★追加
  allTags, // ★追加
  selectTag, // ★追加
  addMemory,
  updateMemory,
  deleteMemory,
  deleteChatLog,
  askBrain,
  isAiThinking,
  initAuth,
  logout,
  loading,
} = useMyBrain();

const inputMode = ref<"memo" | "chat">("memo");
const inputText = ref("");
const currentStreamingAnswer = ref("");
const selectedFile = ref<File | null>(null); // ★変更: Image -> File
const filePreview = ref<string | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const chatContainerRef = ref<HTMLElement | null>(null);

const editingMemory = ref<Memory | null>(null);
const editContent = ref("");

const isListening = ref(false);
let recognition: any = null;

onMounted(() => {
  initAuth();

  if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
    const SpeechRecognition =
      (window as any).webkitSpeechRecognition ||
      (window as any).SpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = "ja-JP";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join("");
      inputText.value = transcript;
    };

    recognition.onend = () => {
      isListening.value = false;
    };
    recognition.onerror = () => {
      isListening.value = false;
    };
  }
});

const toggleListening = () => {
  if (!recognition) return alert("音声入力未対応ブラウザです");
  if (isListening.value) recognition.stop();
  else {
    isListening.value = true;
    recognition.start();
  }
};

const handleFileSelect = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files[0]) {
    const file = target.files[0];
    selectedFile.value = file;

    // 画像ならプレビュー、それ以外はアイコン表示用ダミー
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        filePreview.value = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    } else {
      filePreview.value = null; // 画像以外はプレビューなし
    }
  }
};

const clearFile = () => {
  selectedFile.value = null;
  filePreview.value = null;
  if (fileInputRef.value) fileInputRef.value.value = "";
};

const handleSend = async () => {
  if (!inputText.value.trim() && !selectedFile.value) return;

  if (inputMode.value === "memo") {
    const text = inputText.value;
    const file = selectedFile.value;
    inputText.value = "";
    clearFile();
    await addMemory(text, file);
  } else {
    const question = inputText.value;
    inputText.value = "";
    clearFile();

    currentStreamingAnswer.value = "";
    const answer = await askBrain(question);

    const chars = answer.split("");
    for (const char of chars) {
      currentStreamingAnswer.value += char;
      if (chatContainerRef.value) {
        chatContainerRef.value.scrollTop = chatContainerRef.value.scrollHeight;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    currentStreamingAnswer.value = "";
  }
};

const openDetail = (memo: Memory) => {
  editingMemory.value = memo;
  editContent.value = memo.text;
};

const saveUpdate = async () => {
  if (editingMemory.value) {
    await updateMemory(editingMemory.value.id, editContent.value);
    editingMemory.value = null;
  }
};
</script>

<template>
  <div class="h-screen flex flex-col bg-slate-950 text-slate-200 font-sans">
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

    <div
      v-if="allTags.length > 0"
      class="px-4 py-2 bg-slate-900/50 border-b border-slate-800 overflow-x-auto whitespace-nowrap scrollbar-hide flex gap-2"
    >
      <button
        @click="selectTag(null)"
        class="text-[10px] font-bold px-3 py-1 rounded-full transition border"
        :class="
          !activeTag
            ? 'bg-white text-slate-900 border-white'
            : 'bg-slate-800 text-slate-400 border-slate-700'
        "
      >
        すべて
      </button>
      <button
        v-for="tag in allTags"
        :key="tag"
        @click="selectTag(tag)"
        class="text-[10px] font-bold px-3 py-1 rounded-full transition border"
        :class="
          activeTag === tag
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-slate-800 text-slate-400 border-slate-700'
        "
      >
        #{{ tag }}
      </button>
    </div>

    <main
      ref="chatContainerRef"
      class="flex-1 overflow-y-auto p-4 space-y-6 pb-44 scrollbar-hide"
    >
      <div v-if="inputMode === 'memo'" class="space-y-4">
        <div
          v-if="memories.length === 0 && !loading"
          class="text-center py-20 opacity-30"
        >
          <div class="text-4xl mb-4">📝</div>
          <p>表示できる記憶がありません。</p>
        </div>

        <div
          v-for="memo in memories"
          :key="memo.id"
          @click="openDetail(memo)"
          class="group relative bg-slate-900 border border-slate-800 p-4 rounded-2xl transition hover:border-slate-600 animate-fade-in cursor-pointer active:scale-[0.98]"
        >
          <div
            class="absolute top-4 right-4 flex gap-3 opacity-0 group-hover:opacity-100 transition"
          >
            <span class="text-xs text-slate-500">詳細・編集</span>
          </div>

          <div
            v-if="memo.hasImage"
            class="mb-2 text-xs font-bold flex items-center gap-1"
            :class="
              memo.fileType?.includes('pdf') ? 'text-red-400' : 'text-blue-400'
            "
          >
            <span v-if="memo.fileType?.includes('pdf')">📄 PDF資料</span>
            <span v-else>📷 画像メモ</span>
          </div>

          <p
            class="text-sm text-slate-300 whitespace-pre-wrap mb-3 line-clamp-3"
          >
            {{ memo.text }}
          </p>

          <div class="flex flex-wrap gap-2 items-center">
            <div
              v-if="memo.aiSummary"
              class="text-[10px] bg-slate-800 px-2 py-1 rounded text-slate-400"
            >
              📝 {{ memo.aiSummary }}
            </div>
            <span
              v-for="tag in memo.tags"
              :key="tag"
              class="text-[10px] font-bold text-blue-400"
            >
              #{{ tag }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="inputMode === 'chat'" class="space-y-6">
        <div
          v-if="chatLogs.length === 0 && !isAiThinking"
          class="text-center py-20 opacity-30"
        >
          <div class="text-4xl mb-4">💬</div>
          <p>チャット履歴がありません。</p>
        </div>

        <div
          v-if="isAiThinking || currentStreamingAnswer"
          class="bg-blue-900/20 border border-blue-500/30 p-4 rounded-2xl animate-pulse-soft"
        >
          <div
            class="flex items-center gap-2 mb-2 text-blue-400 font-bold text-xs"
          >
            <span>🤖</span> Thinking...
          </div>
          <p class="text-sm leading-relaxed whitespace-pre-wrap">
            {{ currentStreamingAnswer }}<span class="animate-blink">|</span>
          </p>
        </div>

        <div
          v-for="log in chatLogs"
          :key="log.id"
          class="space-y-2 animate-fade-in group"
        >
          <div class="flex justify-end">
            <div
              class="bg-slate-800 text-white px-4 py-2 rounded-2xl rounded-tr-sm text-sm max-w-[80%]"
            >
              {{ log.question }}
            </div>
          </div>
          <div class="flex justify-start relative">
            <button
              @click="deleteChatLog(log.id)"
              class="absolute -left-6 top-2 text-slate-700 hover:text-red-500 opacity-0 group-hover:opacity-100 transition text-xs"
            >
              🗑️
            </button>
            <div
              class="bg-indigo-900/40 border border-indigo-500/20 text-indigo-100 px-4 py-3 rounded-2xl rounded-tl-sm text-sm max-w-[90%] leading-relaxed whitespace-pre-wrap"
            >
              {{ log.answer }}
            </div>
          </div>
        </div>
      </div>
    </main>

    <div
      v-if="editingMemory"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      @click.self="editingMemory = null"
    >
      <div
        class="bg-slate-900 w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-700 flex flex-col max-h-[80vh]"
      >
        <div class="flex justify-between items-center mb-4">
          <h3 class="font-bold text-lg">📝 メモ詳細・編集</h3>
          <button
            @click="
              deleteMemory(editingMemory.id);
              editingMemory = null;
            "
            class="text-xs text-red-400 hover:text-red-300 font-bold"
          >
            削除
          </button>
        </div>

        <textarea
          v-model="editContent"
          class="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-slate-300 outline-none focus:border-blue-500 mb-4 resize-none leading-relaxed"
        ></textarea>

        <div class="flex gap-3">
          <button
            @click="editingMemory = null"
            class="flex-1 py-3 rounded-xl font-bold text-slate-400 hover:bg-slate-800"
          >
            閉じる
          </button>
          <button
            @click="saveUpdate"
            class="flex-1 py-3 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-500"
          >
            保存する
          </button>
        </div>
      </div>
    </div>

    <footer
      class="fixed bottom-0 w-full bg-slate-900/90 backdrop-blur border-t border-slate-800 p-4 pb-8 z-30 transition-all"
    >
      <div class="max-w-md mx-auto">
        <div
          class="flex gap-2 mb-4 justify-center bg-slate-800 p-1 rounded-full w-fit mx-auto"
        >
          <button
            @click="inputMode = 'memo'"
            class="text-xs font-bold px-6 py-2 rounded-full transition flex items-center gap-2"
            :class="
              inputMode === 'memo'
                ? 'bg-white text-slate-900 shadow-md'
                : 'text-slate-400 hover:text-white'
            "
          >
            <span>📝</span> 記憶する
          </button>
          <button
            @click="inputMode = 'chat'"
            class="text-xs font-bold px-6 py-2 rounded-full transition flex items-center gap-2"
            :class="
              inputMode === 'chat'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            "
          >
            <span>🔍</span> 思い出す
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
              accept="image/*, application/pdf, text/plain, .csv"
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
              isListening
                ? '聞いています...'
                : inputMode === 'memo'
                  ? '記憶する内容...'
                  : '質問を入力...'
            "
            @keydown.enter.prevent="handleSend"
          ></textarea>

          <button
            @click="handleSend"
            :disabled="(!inputText && !selectedFile) || isAiThinking"
            class="w-10 h-10 flex items-center justify-center bg-blue-600 rounded-full text-white disabled:opacity-50 disabled:bg-slate-700 transition shadow-lg shadow-blue-900/50"
          >
            ↑
          </button>
        </div>
      </div>
    </footer>
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
.animate-blink {
  animation: blink 1s infinite;
}
@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}
</style>
