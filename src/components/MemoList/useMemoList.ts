import { ref, computed } from "vue";
import { useMyBrain } from "@/composables/useMyBrain";
import type { Memory } from "@/types"; // ★修正: 正しい場所から型をインポート

/**
 * メモリストの表示ロジックを管理するフック
 * 表示件数の制御（ページネーション）や詳細表示イベントの発火を行います。
 * * @param emit - 親コンポーネントにイベントを伝えるための関数
 */
export function useMemoList(
  emit: (event: "openDetail", memory: Memory) => void,
) {
  // アプリ全体のステートから、フィルタリング済みのメモ一覧とロード状態を取得
  const { filteredMemories, loading } = useMyBrain();

  // 画面に一度に表示する件数のリミット（初期値20件）
  const displayLimit = ref(20);

  /**
   * 画面に表示すべきメモだけを切り出した配列（計算プロパティ）
   * 元のリストが100件あっても、displayLimitが20なら最初の20件だけを返します。
   */
  const displayMemories = computed(() => {
    return filteredMemories.value.slice(0, displayLimit.value);
  });

  /**
   * 「もっと見る」ボタンを表示すべきかどうかを判定するフラグ
   * 表示中の件数より全件数が多ければ true になります。
   */
  const hasMore = computed(() => {
    return displayLimit.value < filteredMemories.value.length;
  });

  /**
   * 「もっと見る」ボタンが押された時の処理
   * 表示制限を20件増やします。
   */
  const loadMore = () => {
    displayLimit.value += 20;
  };

  /**
   * メモをクリックした時の処理
   * 親コンポーネントに「詳細を開いて！」というイベントを送ります。
   * @param memo - クリックされたメモデータ
   */
  const handleOpenDetail = (memo: Memory) => {
    emit("openDetail", memo);
  };

  return {
    displayMemories,
    loading,
    hasMore,
    loadMore,
    handleOpenDetail,
  };
}
