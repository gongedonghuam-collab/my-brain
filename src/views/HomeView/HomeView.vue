<script setup lang="ts">
/**
 * HomeView.vue
 * アプリのメイン画面です。ヘッダー、メインコンテンツ、フッターを統括します。
 * 入力モード（inputMode）によって表示内容（メモ、チャット、カレンダー）を切り替えます。
 */
import { ref } from "vue";
import { useHomeView } from "./useHomeView";
import { useMyBrain } from "@/composables/useMyBrain";

// コンポーネント群のインポート
import AppHeader from "@/components/AppHeader/AppHeader.vue";
import TagFilter from "@/components/TagFilter/TagFilter.vue";
import MemoList from "@/components/MemoList/MemoList.vue";
import ChatList from "@/components/ChatList/ChatList.vue";
import InputFooter from "@/components/InputFooter/InputFooter.vue";
import MemoryModal from "@/components/MemoryModal/MemoryModal.vue";
import FullCalendar from "@fullcalendar/vue3"; // カレンダーコンポーネント

const {
  inputMode,
  editingMemory,
  chatContainerRef,
  showSuccessToast,
  calendarLoading,
  calendarOptions,
  isBottomSheetOpen,
  selectedDateStr,
  selectedDateEvents,
  closeBottomSheet,
  onOpenDetail,
  onModeChange,
  formatTimeRange,
  deleteEvent,
  relatedMemories,
  isSearchingMemories,
  todos,
  toggleTodo,
  deleteTodo,
  dailyReports,
  isReportModalOpen,
  isCalendarConnected,
  reconnectCalendar,
} = useHomeView();

// ユーザー情報と手動タスク追加ロジック
const { addManualTodo, currentUser, startLineAuth } = useMyBrain();
const newTaskTitle = ref("");

const submitTask = async () => {
  if (!newTaskTitle.value.trim()) return;
  await addManualTodo(newTaskTitle.value);
  newTaskTitle.value = "";
};

const latestReport =
  dailyReports.value.length > 0 ? dailyReports.value[0] : null;

// バイブレーション機能（UX向上）
const haptic = () => {
  if (navigator.vibrate) navigator.vibrate(10);
};

// ★追加: 予定をシェアする機能
const shareSchedule = async () => {
  if (!selectedDateEvents.value.length) return;
  const eventsText = selectedDateEvents.value
    .map((e) => `・${formatTimeRange(e)} ${e.title}`)
    .join("\n");
  const shareText = `📅 ${selectedDateStr.value} の予定\n\n${eventsText}\n\n---\nMy Brainで管理中`;
  if (navigator.share) {
    try {
      await navigator.share({
        title: "予定の共有",
        text: shareText,
      });
    } catch (e) {
      console.error(e);
    }
  } else {
    navigator.clipboard.writeText(shareText);
    alert("予定をコピーしました！");
  }
};
</script>

<template>
  <div
    class="h-[100dvh] flex flex-col bg-[#09090b] text-[#f8fafc] font-sans relative overflow-hidden"
  >
    <AppHeader />
    <TagFilter />

    <div
      v-if="latestReport && !isReportModalOpen && inputMode === 'memo'"
      class="px-4 pt-4 pb-2 animate-fade-in"
    >
      <button
        @click="
          isReportModalOpen = true;
          haptic();
        "
        class="w-full bg-gradient-to-r from-slate-900 to-[#121214] border border-[#27272a] rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-black/20 group active:scale-[0.98] transition-transform"
      >
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400"
          >
            📰
          </div>
          <div class="text-left">
            <div
              class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5"
            >
              Daily Insight
            </div>
            <div class="text-sm font-bold text-slate-200">
              {{ latestReport.date }} の振り返り
            </div>
          </div>
        </div>
        <span class="text-slate-600 text-lg">→</span>
      </button>
    </div>

    <main
      ref="chatContainerRef"
      class="flex-1 overflow-y-auto scrollbar-hide transition-all pb-40"
      :class="inputMode === 'calendar' ? 'px-0 pt-0' : 'p-4'"
    >
      <div v-if="inputMode === 'memo'" class="mb-6 animate-fade-in">
        <div class="flex gap-2 mb-6">
          <input
            v-model="newTaskTitle"
            @keydown.enter="submitTask"
            type="text"
            placeholder="タスクを追加..."
            class="flex-1 bg-[#18181b] border border-[#27272a] rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-indigo-500 transition placeholder-slate-600"
          />
          <button
            @click="
              submitTask();
              haptic();
            "
            class="bg-indigo-600 text-white w-12 h-auto rounded-xl flex items-center justify-center hover:bg-indigo-500 active:scale-95 transition shadow-lg shadow-indigo-900/30"
          >
            ＋
          </button>
        </div>

        <div v-if="todos.length > 0" class="space-y-2 mb-8">
          <h3 class="text-xs font-bold text-slate-500 tracking-wider mb-2 px-1">
            TASKS
          </h3>
          <div
            v-for="todo in todos"
            :key="todo.id"
            class="flex items-center gap-3 bg-[#18181b] p-3.5 rounded-xl border border-[#27272a] transition active:scale-[0.99]"
            :class="{ 'opacity-50 grayscale': todo.isCompleted }"
          >
            <button
              @click="
                toggleTodo(todo.id, todo.isCompleted);
                haptic();
              "
              class="w-5 h-5 rounded-md border-2 flex items-center justify-center transition"
              :class="
                todo.isCompleted
                  ? 'bg-indigo-500 border-indigo-500'
                  : 'border-slate-600 hover:border-indigo-400'
              "
            >
              <span
                v-if="todo.isCompleted"
                class="text-[10px] text-white font-bold"
                >✓</span
              >
            </button>
            <span
              class="flex-1 text-sm font-medium truncate text-slate-300"
              :class="{ 'line-through': todo.isCompleted }"
            >
              {{ todo.title }}
            </span>
            <button
              @click="deleteTodo(todo.id)"
              class="text-slate-600 hover:text-red-400 px-2"
            >
              ×
            </button>
          </div>
        </div>

        <h3 class="text-xs font-bold text-slate-500 tracking-wider mb-2 px-1">
          MEMORIES
        </h3>
        <MemoList @openDetail="onOpenDetail" />
      </div>

      <div v-if="inputMode === 'url'" class="animate-fade-in">
        <div class="text-center py-10 text-slate-600 text-sm">
          URLを貼り付けると、AIが要約してここに保存します。
        </div>
        <MemoList @openDetail="onOpenDetail" />
      </div>

      <ChatList v-if="inputMode === 'chat'" />

      <div
        v-if="inputMode === 'calendar'"
        class="w-full h-full flex flex-col animate-fade-in relative bg-[#09090b]"
      >
        <div class="flex-1 p-2 md:p-6 overflow-hidden relative">
          <div
            class="absolute top-14 left-4 right-4 z-20 flex flex-col gap-2 pointer-events-none"
          >
            <div
              v-if="!isCalendarConnected"
              class="bg-red-500/10 border border-red-500/20 backdrop-blur-md rounded-xl p-4 flex items-center justify-between pointer-events-auto"
            >
              <span class="text-red-400 text-xs font-bold">未接続</span>
              <button
                @click="() => reconnectCalendar()"
                class="bg-red-500 text-white text-xs px-3 py-1.5 rounded-lg font-bold"
              >
                再接続
              </button>
            </div>

            <div
              v-if="currentUser && !currentUser.isLineLinked"
              class="bg-green-500/10 border border-green-500/20 backdrop-blur-md rounded-xl p-4 flex items-center justify-between animate-fade-in pointer-events-auto"
            >
              <div class="flex items-center gap-2">
                <span class="text-xl">💬</span>
                <span class="text-green-400 text-xs font-bold"
                  >LINEで通知を受け取る</span
                >
              </div>
              <button
                @click="startLineAuth"
                class="bg-green-500 text-white text-xs px-3 py-1.5 rounded-lg font-bold hover:bg-green-400 transition"
              >
                連携する
              </button>
            </div>
          </div>

          <FullCalendar
            :options="calendarOptions"
            class="w-full h-full font-sans cyber-calendar"
          />
        </div>
      </div>
    </main>

    <MemoryModal :memory="editingMemory" @close="editingMemory = null" />
    <InputFooter :modelValue="inputMode" @update:modelValue="onModeChange" />

    <div
      v-if="isBottomSheetOpen"
      class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity"
      @click="closeBottomSheet"
    ></div>
    <div
      class="fixed bottom-0 left-0 w-full z-50 bg-[#121214] rounded-t-[32px] shadow-[0_-10px_40px_rgba(0,0,0,0.8)] transform transition-transform duration-300 ease-out flex flex-col max-h-[85vh] border-t border-[#27272a]"
      :class="isBottomSheetOpen ? 'translate-y-0' : 'translate-y-full'"
    >
      <div
        class="w-full flex justify-center pt-3 pb-2"
        @click="closeBottomSheet"
      >
        <div class="w-12 h-1.5 bg-slate-700/50 rounded-full"></div>
      </div>

      <div
        class="px-6 pb-4 pt-2 border-b border-[#27272a] flex justify-between items-end"
      >
        <div>
          <div class="text-xs font-bold text-indigo-400 mb-0.5 tracking-wider">
            SELECTED DATE
          </div>
          <div class="text-2xl font-bold text-white tracking-tight">
            {{ selectedDateStr }}
          </div>
        </div>

        <div class="flex gap-2">
          <button
            v-if="selectedDateEvents.length > 0"
            @click="shareSchedule"
            class="bg-indigo-500/20 text-indigo-400 p-2 rounded-full hover:bg-indigo-500/30"
            title="予定をシェア"
          >
            📤
          </button>
          <button
            @click="closeBottomSheet"
            class="bg-[#27272a] p-2 rounded-full text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-6 pb-12">
        <div
          v-if="selectedDateEvents.length === 0"
          class="text-center py-12 text-slate-600"
        >
          <p class="text-sm font-bold">No Events</p>
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="(ev, idx) in selectedDateEvents"
            :key="idx"
            class="bg-[#18181b] p-4 rounded-xl border border-[#27272a] flex gap-4 hover:border-indigo-500/30 transition"
          >
            <div
              class="w-1 h-auto rounded-full"
              :style="{ backgroundColor: ev.backgroundColor }"
            ></div>
            <div class="flex-1">
              <div class="text-xs text-slate-400 font-mono mb-1">
                {{ formatTimeRange(ev) }}
              </div>
              <div class="text-sm font-bold text-white">{{ ev.title }}</div>
            </div>
            <button
              @click.stop="deleteEvent(ev.id)"
              class="text-slate-600 hover:text-red-500"
            >
              🗑️
            </button>
          </div>
        </div>

        <div
          v-if="relatedMemories.length > 0"
          class="mt-8 pt-8 border-t border-[#27272a]"
        >
          <h4
            class="text-xs font-bold text-slate-500 mb-4 tracking-wider flex items-center gap-2"
          >
            <span>🧠</span> 関連する記憶
          </h4>
          <div class="grid gap-2">
            <div
              v-for="m in relatedMemories"
              :key="m.id"
              @click="onOpenDetail(m)"
              class="bg-[#18181b] border border-[#27272a] p-3 rounded-xl text-xs text-slate-300 hover:bg-[#27272a] cursor-pointer leading-relaxed"
            >
              {{ m.aiSummary || m.text.substring(0, 50) }}
            </div>
          </div>
        </div>

        <div
          v-else-if="selectedDateEvents.length > 0 && !isSearchingMemories"
          class="mt-8 pt-8 border-t border-[#27272a] text-center"
        >
          <p class="text-xs text-slate-600">関連する記憶はありませんでした</p>
        </div>

        <div
          v-else-if="isSearchingMemories"
          class="mt-8 pt-8 border-t border-[#27272a] text-center"
        >
          <p class="text-xs text-slate-500 animate-pulse">
            関連情報を検索中...
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
