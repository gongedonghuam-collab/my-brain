import { useMyBrain } from "@/composables/useMyBrain";

export function useTagFilter() {
  // 全タグリスト、現在選択中のタグ、タグを選ぶ関数を持ってくる
  const { activeTag, allTags, selectTag } = useMyBrain();

  return {
    activeTag,
    allTags,
    selectTag,
  };
}
