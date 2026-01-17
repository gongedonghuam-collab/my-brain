<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from "vue";
import { useNotifications } from "@/composables/useNotifications";

const {
  notifications,
  isDropdownOpen,
  toggleDropdown,
  markAsRead,
  markAllRead,
} = useNotifications();

const unreadCount = computed(
  () => notifications.value.filter((n) => !n.isRead).length
);
const bellContainerRef = ref<HTMLElement | null>(null);

// 外側クリックを検知して閉じる処理
const handleClickOutside = (event: MouseEvent) => {
  if (
    isDropdownOpen.value &&
    bellContainerRef.value &&
    !bellContainerRef.value.contains(event.target as Node)
  ) {
    isDropdownOpen.value = false;
  }
};

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
});
onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});

// 時間表示 (例: 5分前)
const formatTime = (date: Date) => {
  const diff = (new Date().getTime() - date.getTime()) / 1000;
  if (diff < 60) return "たった今";
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

// 通知タイプごとのスタイル
const getTypeStyles = (type: string) => {
  switch (type) {
    case "reservation":
      return {
        icon: "📅",
        bg: "bg-teal-50",
        border: "border-teal-100",
        text: "text-teal-700",
      };
    case "cancel":
      return {
        icon: "⚠️",
        bg: "bg-rose-50",
        border: "border-rose-100",
        text: "text-rose-700",
      };
    default:
      return {
        icon: "ℹ️",
        bg: "bg-slate-50",
        border: "border-slate-100",
        text: "text-slate-500",
      };
  }
};
</script>

<template>
  <div ref="bellContainerRef" class="relative z-50">
    <button
      @click.stop="toggleDropdown"
      class="relative w-10 h-10 rounded-full bg-white border border-slate-100 flex items-center justify-center hover:bg-slate-50 transition active:scale-95 shadow-sm"
    >
      <span class="text-xl">🔔</span>
      <span
        v-if="unreadCount > 0"
        class="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white animate-pulse"
      >
        {{ unreadCount > 9 ? "9+" : unreadCount }}
      </span>
    </button>

    <Transition name="pop">
      <div
        v-if="isDropdownOpen"
        class="absolute top-12 right-[-60px] md:right-0 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden origin-top-right"
      >
        <div
          class="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 backdrop-blur"
        >
          <h3 class="font-bold text-sm text-slate-700">通知センター</h3>
          <button
            v-if="unreadCount > 0"
            @click="markAllRead"
            class="text-[10px] text-teal-600 font-bold hover:underline"
          >
            すべて既読
          </button>
        </div>

        <div class="max-h-[350px] overflow-y-auto custom-scrollbar">
          <div
            v-if="notifications.length === 0"
            class="p-10 text-center text-slate-400 text-xs"
          >
            <p class="text-2xl mb-2">💤</p>
            通知はありません
          </div>

          <div
            v-for="item in notifications"
            :key="item.id"
            @click="markAsRead(item.id)"
            class="p-4 border-b border-slate-50 hover:bg-slate-50 transition cursor-pointer relative group"
            :class="{ 'bg-teal-50/20': !item.isRead }"
          >
            <div
              v-if="!item.isRead"
              class="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-rose-500 rounded-full"
            ></div>

            <div class="flex gap-3 pl-2">
              <div
                class="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-lg shadow-sm border"
                :class="[
                  getTypeStyles(item.type).bg,
                  getTypeStyles(item.type).border,
                ]"
              >
                {{ getTypeStyles(item.type).icon }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex justify-between items-start mb-0.5">
                  <p class="text-xs font-bold text-slate-800 truncate">
                    {{ item.title }}
                  </p>
                  <span class="text-[9px] text-slate-400 flex-shrink-0 ml-2">{{
                    formatTime(item.timestamp)
                  }}</span>
                </div>
                <p
                  class="text-[11px] text-slate-500 leading-tight line-clamp-2"
                >
                  {{ item.message }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.pop-enter-active,
.pop-leave-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-10px);
}
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}
</style>
