import { ref, watch } from "vue";
import { useMyBrain, type Memory } from "@/composables/useMyBrain";

export function useMemoryModal(props: { memory: Memory | null }, emit: any) {
  const { updateMemory, deleteMemory } = useMyBrain();
  const editContent = ref("");

  // メモが開かれたら、中身のテキストを編集エリアにセットする
  watch(
    () => props.memory,
    (newVal) => {
      if (newVal) {
        editContent.value = newVal.text;
      }
    },
  );

  const saveUpdate = async () => {
    if (props.memory) {
      await updateMemory(props.memory.id, editContent.value);
      emit("close"); // 閉じる
    }
  };

  const remove = async () => {
    if (props.memory) {
      await deleteMemory(props.memory.id);
      emit("close"); // 閉じる
    }
  };

  return {
    editContent,
    saveUpdate,
    remove,
  };
}
