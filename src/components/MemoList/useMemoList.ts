import { ref, computed } from "vue";
import { useMyBrain, type Memory } from "@/composables/useMyBrain";

export function useMemoList(
  emit: (event: "openDetail", memory: Memory) => void,
) {
  const { filteredMemories, loading } = useMyBrain();

  // 初期表示件数（20件）
  const displayLimit = ref(20);

  // 画面に表示するのは、制限内の件数だけ
  const displayMemories = computed(() => {
    return filteredMemories.value.slice(0, displayLimit.value);
  });

  // 全件数よりも表示件数が少なければ「もっと見る」ボタンを出せる
  const hasMore = computed(() => {
    return displayLimit.value < filteredMemories.value.length;
  });

  // 「もっと見る」を押した時の処理
  const loadMore = () => {
    displayLimit.value += 20;
  };

  const handleOpenDetail = (memo: Memory) => {
    emit("openDetail", memo);
  };

  return {
    displayMemories, // ← ここを画面で使う
    loading,
    hasMore,
    loadMore,
    handleOpenDetail,
  };
}
