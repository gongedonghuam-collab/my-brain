import { useMyBrain } from "@/composables/useMyBrain";

/**
 * タグフィルターのロジックを管理するフック
 * メモ一覧の絞り込みに使用するタグの選択状態と、タグリストを提供します。
 */
export function useTagFilter() {
  // アプリ全体のステートから必要な情報を取得
  const { activeTag, allTags, selectTag } = useMyBrain();

  return {
    /** 現在選択中のタグ (nullの場合は「すべて表示」) */
    activeTag,
    /** 保存されているメモから抽出された、全タグのリスト（重複なし） */
    allTags,
    /** * タグを選択する関数
     * @param tag - 選択するタグ名（nullを渡すと解除）
     */
    selectTag,
  };
}
