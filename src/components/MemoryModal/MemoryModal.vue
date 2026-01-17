<script setup lang="ts">
import { useMemoryModal } from "./useMemoryModal";
import type { Memory } from "@/composables/useMyBrain";

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
      class="bg-slate-900 w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-700 flex flex-col max-h-[80vh]"
    >
      <div class="flex justify-between items-center mb-4">
        <h3 class="font-bold text-lg">📝 詳細・編集</h3>
        <button
          @click="remove"
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
          @click="$emit('close')"
          class="flex-1 py-3 rounded-xl font-bold text-slate-400 hover:bg-slate-800"
        >
          閉じる
        </button>
        <button
          @click="saveUpdate"
          class="flex-1 py-3 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-500"
        >
          保存
        </button>
      </div>
    </div>
  </div>
</template>
