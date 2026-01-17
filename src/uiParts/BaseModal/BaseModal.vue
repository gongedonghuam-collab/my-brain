<script setup lang="ts">
import { ref } from "vue";

const dialog = ref<HTMLDialogElement | null>(null);

// ★重要: 親から show() と close() を呼べるようにする
defineExpose({
  show: () => dialog.value?.showModal(),
  close: () => dialog.value?.close(),
});
</script>

<template>
  <dialog
    ref="dialog"
    class="modal p-0 rounded-xl shadow-2xl backdrop:bg-black/50"
    @click.self="dialog?.close()"
  >
    <div class="bg-white p-6 w-80 md:w-96 max-h-[85vh] overflow-y-auto">
      <slot></slot>
    </div>
  </dialog>
</template>
