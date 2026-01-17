<script setup lang="ts">
defineProps<{
  modelValue: string | number;
  label?: string;
  type?: string;
  placeholder?: string;
}>();
defineEmits(["update:modelValue"]);
</script>

<template>
  <div class="w-full">
    <label
      v-if="label"
      class="block text-xs font-bold text-stone-500 mb-1.5 ml-1"
      >{{ label }}</label
    >
    <input
      :type="type || 'text'"
      :value="modelValue"
      @input="
        $emit('update:modelValue', ($event.target as HTMLInputElement).value)
      "
      :placeholder="placeholder"
      class="w-full border border-stone-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-rose-400 focus:border-rose-400 outline-none transition bg-white text-stone-700 placeholder-stone-300"
    />
  </div>
</template>
