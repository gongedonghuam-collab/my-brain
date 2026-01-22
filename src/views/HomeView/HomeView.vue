<script setup lang="ts">
import { ref } from "vue";
import { useHomeView } from "./useHomeView";
import { useMyBrain } from "@/composables/useMyBrain";

// コンポーネント
import AppHeader from "@/components/AppHeader/AppHeader.vue";
import TagFilter from "@/components/TagFilter/TagFilter.vue";
import MemoList from "@/components/MemoList/MemoList.vue";
import ChatList from "@/components/ChatList/ChatList.vue";
import InputFooter from "@/components/InputFooter/InputFooter.vue";
import MemoryModal from "@/components/MemoryModal/MemoryModal.vue";
import FullCalendar from "@fullcalendar/vue3";
import BaseModal from "@/components/BaseModal/BaseModal.vue";

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
  isCalendarConnected, // ★追加
  reconnectCalendar, // ★追加
} = useHomeView();

const { addManualTodo } = useMyBrain();
const newTaskTitle = ref("");

const submitTask = async () => {
  if (!newTaskTitle.value.trim()) return;
  await addManualTodo(newTaskTitle.value);
  newTaskTitle.value = "";
};

const latestReport =
  dailyReports.value.length > 0 ? dailyReports.value[0] : null;
</script>

<template>
  <div
    class="h-[100dvh] flex flex-col bg-slate-950 text-slate-200 font-sans relative overflow-hidden"
  >
    <Transition name="toast">
      <div
        v-if="showSuccessToast"
        class="absolute top-6 left-1/2 -translate-x-1/2 z-50 bg-green-500 text-white px-6 py-4 rounded-full shadow-2xl flex items-center gap-3 border-2 border-green-400 w-[90%] max-w-sm"
      >
        <span class="text-2xl">✅</span>
        <div>
          <p class="font-bold text-sm">LINE連携完了！</p>
        </div>
      </div>
    </Transition>

    <AppHeader />
    <TagFilter />

    <div v-if="latestReport && !isReportModalOpen" class="px-4 pt-2">
      <button
        @click="isReportModalOpen = true"
        class="w-full bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-3 flex items-center justify-between shadow-lg"
      >
        <div class="flex items-center gap-2">
          <span class="text-xl">📰</span>
          <div class="text-left">
            <div class="text-[10px] font-bold opacity-80">DAILY REPORT</div>
            <div class="text-xs font-bold text-white">
              {{ latestReport.date }} のまとめ
            </div>
          </div>
        </div>
        <span class="text-xs">→</span>
      </button>
    </div>

    <main
      ref="chatContainerRef"
      class="flex-1 overflow-y-auto scrollbar-hide transition-all"
      :class="inputMode === 'calendar' ? 'p-0 md:p-6' : 'p-4 pb-72'"
    >
      <div v-if="inputMode === 'memo'" class="mb-6">
        <div class="flex items-center gap-2 mb-2 px-1">
          <span class="text-sm font-bold text-slate-400"
            >🔥 TASKS (AI Extracted)</span
          >
        </div>

        <div class="flex gap-2 mb-4">
          <input
            v-model="newTaskTitle"
            @keydown.enter="submitTask"
            type="text"
            placeholder="タスクを追加..."
            class="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-blue-500 placeholder-slate-600"
          />
          <button
            @click="submitTask"
            class="bg-slate-800 text-white w-10 h-10 rounded-xl flex items-center justify-center hover:bg-slate-700 active:scale-95 transition"
          >
            ＋
          </button>
        </div>

        <div
          v-if="todos.length === 0"
          class="text-xs text-slate-600 px-2 py-4 border border-slate-800 rounded-xl text-center border-dashed"
        >
          タスクはありません
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="todo in todos"
            :key="todo.id"
            class="flex items-center gap-3 bg-slate-900/50 p-3 rounded-xl border border-slate-800 transition"
            :class="{ 'opacity-50': todo.isCompleted }"
          >
            <button
              @click="toggleTodo(todo.id, todo.isCompleted)"
              class="w-5 h-5 rounded-full border-2 flex items-center justify-center transition"
              :class="
                todo.isCompleted
                  ? 'bg-blue-500 border-blue-500'
                  : 'border-slate-600'
              "
            >
              <span v-if="todo.isCompleted" class="text-[10px] text-white"
                >✓</span
              >
            </button>
            <span
              class="flex-1 text-sm font-bold truncate"
              :class="{ 'line-through text-slate-500': todo.isCompleted }"
            >
              {{ todo.title }}
            </span>
            <button
              @click="deleteTodo(todo.id)"
              class="text-slate-600 hover:text-red-400"
            >
              ×
            </button>
          </div>
        </div>
      </div>

      <MemoList
        v-if="inputMode === 'memo' || inputMode === 'url'"
        @openDetail="onOpenDetail"
      />
      <ChatList v-if="inputMode === 'chat'" />

      <div
        v-if="inputMode === 'calendar'"
        class="w-full h-full flex flex-col animate-fade-in relative md:max-w-6xl md:mx-auto"
      >
        <div
          class="hidden md:block absolute top-[-50px] left-[-50px] w-64 h-64 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none"
        ></div>
        <div
          class="hidden md:block absolute bottom-[-50px] right-[-50px] w-80 h-80 bg-blue-600/10 rounded-full blur-[100px] pointer-events-none"
        ></div>

        <div
          class="calendar-wrapper backdrop-blur-xl bg-slate-900/60 md:bg-slate-800/40 relative flex flex-col border-b md:border border-slate-700/30 md:rounded-3xl shadow-2xl overflow-hidden"
        >
          <div
            v-if="!isCalendarConnected"
            class="absolute inset-0 bg-slate-950/80 z-30 flex flex-col items-center justify-center backdrop-blur-sm p-6 text-center"
          >
            <p class="text-slate-300 font-bold mb-4">
              Googleカレンダーとの接続が切れました
            </p>
            <button
              @click="reconnectCalendar"
              class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-full font-bold shadow-lg flex items-center gap-2"
            >
              <span class="text-xl">🔄</span> 再接続する
            </button>
          </div>

          <div
            v-if="calendarLoading"
            class="absolute inset-0 bg-slate-950/60 z-20 flex items-center justify-center backdrop-blur-sm"
          >
            <div
              class="animate-spin h-12 w-12 border-4 border-indigo-500 rounded-full border-t-transparent shadow-[0_0_20px_rgba(99,102,241,0.6)]"
            ></div>
          </div>

          <div class="p-1 md:p-6 h-full">
            <FullCalendar
              :options="calendarOptions"
              class="w-full h-full font-sans cyber-calendar"
            />
          </div>
        </div>
      </div>
    </main>

    <div
      v-if="isReportModalOpen && latestReport"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      @click.self="isReportModalOpen = false"
    >
      <div
        class="bg-slate-900 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-700 max-h-[80vh] overflow-y-auto"
      >
        <h2 class="text-xl font-bold text-white mb-1">📅 Daily Report</h2>
        <p class="text-xs text-slate-400 mb-6">{{ latestReport.date }}</p>

        <div class="space-y-6">
          <div>
            <h3 class="text-sm font-bold text-indigo-400 mb-2">総括</h3>
            <p class="text-sm text-slate-300 leading-relaxed">
              {{ latestReport.content }}
            </p>
          </div>

          <div>
            <h3 class="text-sm font-bold text-indigo-400 mb-2">ハイライト</h3>
            <ul class="space-y-2">
              <li
                v-for="(h, i) in latestReport.highlights"
                :key="i"
                class="flex gap-2 text-sm text-slate-300"
              >
                <span class="text-indigo-500">•</span>
                {{ h }}
              </li>
            </ul>
          </div>
        </div>

        <button
          @click="isReportModalOpen = false"
          class="mt-8 w-full py-3 bg-slate-800 rounded-xl text-white font-bold"
        >
          閉じる
        </button>
      </div>
    </div>

    <div
      v-if="isBottomSheetOpen"
      class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity"
      @click="closeBottomSheet"
    ></div>

    <div
      class="fixed bottom-0 left-0 w-full z-50 bg-[#1A1D26] rounded-t-[32px] shadow-[0_-10px_40px_rgba(0,0,0,0.6)] transform transition-transform duration-300 ease-out flex flex-col max-h-[85vh] border-t border-slate-700/50"
      :class="isBottomSheetOpen ? 'translate-y-0' : 'translate-y-full'"
    >
      <div
        class="w-full flex justify-center pt-3 pb-2"
        @click="closeBottomSheet"
      >
        <div class="w-10 h-1 bg-slate-600/50 rounded-full"></div>
      </div>

      <div
        class="px-6 pb-4 pt-1 border-b border-slate-800/50 flex justify-between items-end"
      >
        <div>
          <div
            class="text-xs font-bold text-slate-400 mb-1 font-mono tracking-wider"
          >
            {{ selectedDateStr.split("-")[0] }}.{{
              selectedDateStr.split("-")[1]
            }}
          </div>
          <div class="flex items-baseline gap-2">
            <span class="text-4xl font-black text-white tracking-tighter">
              {{ selectedDateStr.split("-")[2] }}
            </span>
            <span class="text-lg font-bold text-slate-500 uppercase">
              {{
                new Date(selectedDateStr).toLocaleDateString("en-US", {
                  weekday: "short",
                })
              }}
            </span>
          </div>
        </div>

        <button
          @click="closeBottomSheet"
          class="bg-slate-800/80 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 transition"
        >
          <span class="text-xl leading-none">×</span>
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-5 pb-10">
        <div class="space-y-4 mb-10">
          <div
            v-if="selectedDateEvents.length === 0"
            class="flex flex-col items-center justify-center py-10 text-slate-600 opacity-60"
          >
            <span class="text-4xl mb-3">☕️</span>
            <p class="text-xs font-bold tracking-widest">NO EVENTS</p>
          </div>

          <div
            v-for="(ev, idx) in selectedDateEvents"
            :key="idx"
            class="relative pl-4 group"
          >
            <div
              class="absolute left-[7px] top-2 bottom-[-16px] w-[2px] bg-slate-800 group-last:hidden"
            ></div>
            <div
              class="absolute left-0 top-2 w-4 h-4 rounded-full border-2 border-[#1A1D26]"
              :style="{ backgroundColor: ev.backgroundColor }"
            ></div>

            <div
              class="ml-4 p-4 bg-slate-800/40 rounded-2xl border border-slate-700/30 flex justify-between items-start active:scale-[0.98] transition backdrop-blur-sm"
            >
              <div class="flex-1 min-w-0">
                <div
                  class="text-xs font-mono text-slate-400 mb-1 flex items-center gap-2"
                >
                  <span :style="{ color: ev.backgroundColor }">●</span>
                  {{ formatTimeRange(ev) }}
                </div>
                <div class="text-base font-bold text-slate-100 leading-snug">
                  {{ ev.title }}
                </div>
              </div>

              <button
                @click.stop="deleteEvent(ev.id)"
                class="ml-2 w-8 h-8 flex items-center justify-center rounded-full text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 transition"
              >
                🗑️
              </button>
            </div>
          </div>
        </div>

        <div v-if="selectedDateEvents.length > 0">
          <div class="flex items-center gap-2 mb-4 px-1 opacity-80">
            <span class="text-lg">🧠</span>
            <span class="text-xs font-bold text-slate-400 tracking-wider"
              >RELATED MEMORIES</span
            >
          </div>

          <div v-if="isSearchingMemories" class="flex justify-center py-6">
            <div class="flex gap-1">
              <div
                class="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"
                style="animation-delay: 0s"
              ></div>
              <div
                class="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"
                style="animation-delay: 0.1s"
              ></div>
              <div
                class="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"
                style="animation-delay: 0.2s"
              ></div>
            </div>
          </div>

          <div v-else class="grid gap-3">
            <div
              v-for="memo in relatedMemories"
              :key="memo.id"
              @click="onOpenDetail(memo)"
              class="bg-gradient-to-br from-indigo-900/20 to-slate-800/30 border border-indigo-500/20 p-4 rounded-2xl hover:border-indigo-500/40 transition cursor-pointer"
            >
              <div class="flex justify-between items-start mb-2">
                <span
                  class="text-[9px] font-bold bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full"
                >
                  AI Summary
                </span>
                <span class="text-[10px] text-slate-500 font-mono">
                  {{
                    new Date(memo.createdAt?.toDate?.()).toLocaleDateString()
                  }}
                </span>
              </div>
              <p class="text-xs text-slate-300 leading-relaxed line-clamp-2">
                {{ memo.aiSummary || memo.text }}
              </p>
            </div>

            <div
              v-if="relatedMemories.length === 0"
              class="text-center py-4 text-xs text-slate-600"
            >
              関連する記憶はありませんでした
            </div>
          </div>
        </div>
      </div>
    </div>

    <MemoryModal :memory="editingMemory" @close="editingMemory = null" />
    <InputFooter :modelValue="inputMode" @update:modelValue="onModeChange" />
  </div>
</template>

<style>
/* styleタグの中身は変更なし */
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
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.animate-fade-in {
  animation: fadeIn 0.4s ease-out;
}

.calendar-wrapper {
  height: calc(100dvh - 310px);
}

@media (min-width: 768px) {
  .calendar-wrapper {
    height: calc(100dvh - 250px);
  }
}

/* Cyber Glass Theme */
.fc {
  font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
  --fc-border-color: rgba(255, 255, 255, 0.1);
  --fc-today-bg-color: rgba(99, 102, 241, 0.15);
  --fc-page-bg-color: transparent;
  --fc-neutral-bg-color: transparent;
}

.fc .fc-toolbar-title {
  font-size: 1.1rem !important;
  font-weight: 800 !important;
  color: #f1f5f9;
  letter-spacing: 0.05em;
  text-shadow: 0 0 15px rgba(99, 102, 241, 0.5);
}
@media (min-width: 768px) {
  .fc .fc-toolbar-title {
    font-size: 1.5rem !important;
  }
}

.fc .fc-button {
  background-color: rgba(255, 255, 255, 0.03) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  color: #cbd5e1 !important;
  border-radius: 12px !important;
  padding: 0.3rem 0.6rem !important;
  transition: all 0.2s;
}
.fc .fc-button:hover {
  background-color: rgba(255, 255, 255, 0.1) !important;
  color: white !important;
  border-color: rgba(255, 255, 255, 0.3) !important;
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.1);
}
.fc .fc-button-active {
  background-color: rgba(99, 102, 241, 0.4) !important;
  border-color: rgba(99, 102, 241, 0.6) !important;
  color: white !important;
  box-shadow: 0 0 15px rgba(99, 102, 241, 0.3) !important;
}

.fc-col-header-cell-cushion {
  color: #94a3b8;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 8px 0 !important;
  letter-spacing: 0.05em;
}
@media (min-width: 768px) {
  .fc-col-header-cell-cushion {
    font-size: 0.85rem;
  }
}

.fc-daygrid-day-number {
  color: #e2e8f0;
  font-size: 0.85rem;
  font-weight: 600;
  padding: 4px 8px !important;
  opacity: 0.9;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}
@media (min-width: 768px) {
  .fc-daygrid-day-number {
    font-size: 1rem;
    padding: 8px 12px !important;
  }
}

.fc-event {
  border: none !important;
  background: transparent !important;
  margin-top: 2px !important;
  cursor: pointer;
}

.fc-content-custom {
  display: flex;
  align-items: center;
  background-color: rgba(30, 41, 59, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 2px 0;
  border-radius: 4px;
  overflow: hidden;
  transition:
    transform 0.15s,
    box-shadow 0.15s;
  width: 100%;
}
@media (min-width: 768px) {
  .fc-content-custom {
    padding: 3px 0;
    border-radius: 6px;
    background-color: rgba(51, 65, 85, 0.7);
  }
  .fc-content-custom:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    background-color: rgba(71, 85, 105, 0.9);
    z-index: 10;
  }
}

.fc-marker {
  width: 3px;
  height: 12px;
  border-radius: 2px;
  margin-left: 4px;
  margin-right: 4px;
  box-shadow: 0 0 6px currentColor;
  flex-shrink: 0;
}
@media (min-width: 768px) {
  .fc-marker {
    height: 16px;
    width: 4px;
    margin-left: 6px;
    margin-right: 6px;
  }
}

.fc-details {
  display: flex;
  align-items: baseline;
  gap: 6px;
  overflow: hidden;
  padding-right: 4px;
  width: 100%;
}

.fc-time-custom {
  color: #94a3b8;
  font-size: 0.65rem;
  font-weight: 700;
  white-space: nowrap;
}
@media (min-width: 768px) {
  .fc-time-custom {
    font-size: 0.75rem;
    color: #cbd5e1;
  }
}

.fc-title-custom {
  color: #f1f5f9;
  font-size: 0.7rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
}
@media (min-width: 768px) {
  .fc-title-custom {
    font-size: 0.75rem;
  }
}

@media (max-width: 640px) {
  .fc-toolbar-title {
    font-size: 1.1rem !important;
  }
  .fc-time-custom {
    display: none;
  }
  .fc-marker {
    margin-right: 4px;
    margin-left: 4px;
  }
  .fc-button {
    padding: 0.25rem 0.5rem !important;
  }
  .fc-daygrid-more-link {
    font-size: 0.7rem;
    color: #818cf8 !important;
    font-weight: bold;
    text-decoration: none !important;
    background: rgba(129, 140, 248, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
    display: block;
    margin-top: 2px;
  }
}
</style>
