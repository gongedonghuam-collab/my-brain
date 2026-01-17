<script setup lang="ts">
import { useMemoList } from "./useMemoList";
import type { Memory } from "@/composables/useMyBrain";

const emit = defineEmits<{
  (e: "openDetail", memory: Memory): void;
}>();

const { displayMemories, loading, hasMore, loadMore, handleOpenDetail } =
  useMemoList(emit);
</script>

<template>
  <div class="space-y-4">
    <div
      v-if="displayMemories.length === 0 && !loading"
      class="text-center py-20 opacity-30"
    >
      <div class="text-4xl mb-4">📝</div>
      <p>表示できる記憶がありません。</p>
    </div>

    <div
      v-for="memo in displayMemories"
      :key="memo.id"
      @click="handleOpenDetail(memo)"
      class="group relative bg-slate-900 border border-slate-800 p-4 rounded-2xl transition hover:border-slate-600 animate-fade-in cursor-pointer active:scale-[0.98]"
    >
      <div
        class="mb-2 text-xs font-bold flex items-center justify-between text-slate-400"
      >
        <div class="flex items-center gap-1">
          <span v-if="memo.hasImage" class="text-blue-400">📷 画像</span>
          <span
            v-else-if="memo.text.includes('【WEB記事】')"
            class="text-green-400"
            >🌐 WEB</span
          >
          <span v-else-if="memo.fileType?.includes('pdf')" class="text-red-400"
            >📄 資料</span
          >
          <span v-else>📝 メモ</span>
        </div>

        <div class="flex items-center gap-2">
          <span class="opacity-50 text-[10px]">{{
            memo.createdAt?.toDate?.().toLocaleDateString()
          }}</span>
          <span
            class="bg-slate-800 text-slate-500 px-2 py-0.5 rounded text-[10px]"
            >詳細</span
          >
        </div>
      </div>

      <p class="text-sm text-slate-300 whitespace-pre-wrap mb-3 line-clamp-3">
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
          >#{{ tag }}</span
        >
      </div>
    </div>

    <div v-if="hasMore" class="text-center py-4">
      <button
        @click="loadMore"
        class="text-sm font-bold text-slate-500 hover:text-white bg-slate-800 px-6 py-2 rounded-full transition"
      >
        ▼ もっと読み込む
      </button>
    </div>
  </div>
</template>
