<script setup lang="ts">
interface Props {
  variant?: "primary" | "secondary" | "danger" | "text";
  block?: boolean;
}
withDefaults(defineProps<Props>(), {
  variant: "primary",
  block: false,
});
</script>

<template>
  <button
    :class="[
      'font-bold py-2 px-4 rounded-lg transition duration-200 flex items-center justify-center gap-2 shadow-sm',
      block ? 'w-full' : '',
      variant === 'primary'
        ? 'bg-rose-500 hover:bg-rose-600 text-white'
        : variant === 'secondary'
        ? 'bg-white border-2 border-rose-500 text-rose-600 hover:bg-rose-50'
        : variant === 'danger'
        ? 'bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600'
        : 'text-stone-500 hover:text-stone-700 hover:bg-stone-100',
    ]"
  >
    <slot></slot>
  </button>
</template>
