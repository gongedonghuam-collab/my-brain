<script setup lang="ts">
import { useHomeView } from "./useHomeView";

// コンポーネント
import AppHeader from "@/components/AppHeader/AppHeader.vue";
import TagFilter from "@/components/TagFilter/TagFilter.vue";
import MemoList from "@/components/MemoList/MemoList.vue";
import ChatList from "@/components/ChatList/ChatList.vue";
import InputFooter from "@/components/InputFooter/InputFooter.vue";
import MemoryModal from "@/components/MemoryModal/MemoryModal.vue";
import FullCalendar from "@fullcalendar/vue3";

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
  formatDateHeader,
  formatTimeRange,
  deleteEvent, // ★取得
} = useHomeView();
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

    <main
      ref="chatContainerRef"
      class="flex-1 overflow-y-auto scrollbar-hide transition-all"
      :class="inputMode === 'calendar' ? 'p-0 md:p-6' : 'p-4 pb-72'"
    >
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
      v-if="isBottomSheetOpen"
      class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity"
      @click="closeBottomSheet"
    ></div>

    <div
      class="fixed bottom-0 left-0 w-full z-50 bg-[#1A1D26] rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)] transform transition-transform duration-300 ease-out flex flex-col max-h-[70vh] border-t border-slate-700/50"
      :class="isBottomSheetOpen ? 'translate-y-0' : 'translate-y-full'"
    >
      <div
        class="w-full flex justify-center pt-3 pb-1"
        @click="closeBottomSheet"
      >
        <div class="w-12 h-1.5 bg-slate-600 rounded-full"></div>
      </div>

      <div
        class="px-6 py-4 border-b border-slate-800 flex justify-between items-center"
      >
        <h3 class="text-lg font-bold text-white tracking-wide">
          {{ formatDateHeader(selectedDateStr) }}
        </h3>
        <button
          @click="closeBottomSheet"
          class="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white"
        >
          ×
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-4 space-y-3 pb-10">
        <div
          v-if="selectedDateEvents.length === 0"
          class="text-center py-10 text-slate-500"
        >
          <p class="text-2xl mb-2">💤</p>
          予定はありません
        </div>

        <div
          v-for="(ev, idx) in selectedDateEvents"
          :key="idx"
          class="flex items-center gap-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 active:scale-[0.99] transition group"
        >
          <div
            class="w-1 h-10 rounded-full shadow-[0_0_10px_currentColor]"
            :style="{
              backgroundColor: ev.backgroundColor,
              color: ev.backgroundColor,
            }"
          ></div>

          <div class="flex-1 min-w-0">
            <div class="text-xs text-slate-400 font-bold mb-0.5">
              {{ formatTimeRange(ev) }}
            </div>
            <div class="text-sm text-white font-bold truncate">
              {{ ev.title }}
            </div>
          </div>

          <button
            @click.stop="deleteEvent(ev.id)"
            class="w-8 h-8 flex items-center justify-center rounded-full text-slate-500 hover:text-red-500 hover:bg-slate-700/50 transition"
          >
            🗑️
          </button>
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
