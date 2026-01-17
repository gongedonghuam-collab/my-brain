<script setup lang="ts">
import { useTagFilter } from "./useTagFilter";

const { activeTag, allTags, selectTag } = useTagFilter();
</script>

<template>
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
</template>
