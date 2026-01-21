<script setup lang="ts">
import { useMemoryModal } from "./useMemoryModal";
import type { Memory } from "@/types";

const props = defineProps<{
  memory: Memory | null;
}>();

const emit = defineEmits(["close"]);

const { editContent, saveUpdate, remove } = useMemoryModal(props, emit);
</script>

<template>
  <div
    v-if="memory"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    @click.self="$emit('close')"
  >
    <div
      class="bg-slate-900 w-full max-w-4xl h-[90vh] rounded-3xl p-6 shadow-2xl border border-slate-700 flex flex-col"
    >
      <div class="flex justify-between items-center mb-4">
        <h3 class="font-bold text-xl text-white">📝 詳細・編集</h3>
        <button
          @click="remove"
          class="text-sm text-red-400 hover:text-red-300 font-bold px-3 py-1 rounded hover:bg-red-900/20"
        >
          削除
        </button>
      </div>

      <textarea
        v-model="editContent"
        class="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-6 text-base text-slate-300 outline-none focus:border-blue-500 mb-4 resize-none leading-relaxed"
      ></textarea>

      <div class="flex gap-4">
        <button
          @click="$emit('close')"
          class="flex-1 py-4 rounded-xl font-bold text-slate-400 hover:bg-slate-800 transition"
        >
          閉じる
        </button>
        <button
          @click="saveUpdate"
          class="flex-1 py-4 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-500 transition shadow-lg shadow-blue-900/20"
        >
          保存
        </button>
      </div>
    </div>
  </div>
</template>
