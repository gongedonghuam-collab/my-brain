import { watch, nextTick } from "vue";
import { useMyBrain } from "@/composables/useMyBrain";
import mermaid from "mermaid"; // 図解を描画するためのライブラリ

/**
 * チャットリストのロジックを管理するフック
 * チャットログの監視と、Mermaid記法（テキストによる図解）のレンダリングを担当します。
 */
export function useChatList() {
  // アプリ全体の共有ステートからチャットログなどを取得
  const { chatLogs, isAiThinking, deleteChatLog } = useMyBrain();

  /**
   * チャットログの変更を監視し、新しいログに図解コードが含まれていれば描画する処理
   * @param chatLogs - 監視対象のチャットログ配列
   */
  watch(
    chatLogs,
    async () => {
      // DOM（画面）の更新が完了するのを待つ
      await nextTick();

      // クラス名 "mermaid" を持つ要素（図解のコードが書かれたdiv）を全て取得
      const elements = document.querySelectorAll(".mermaid");

      elements.forEach(async (el) => {
        const element = el as HTMLElement;
        // 既に描画処理済みの要素はスキップ（無駄な再描画を防ぐため）
        if (element.getAttribute("data-processed")) return;

        // data-code属性からMermaidのソースコードを取得
        // ChatList.vue側で :data-code="log.mermaidCode" のようにセットされている前提
        const code = element.getAttribute("data-code") || "";
        const id = element.id;

        if (!code || !id) return;

        try {
          // Mermaidライブラリを使って、テキストコードをSVG画像に変換
          const { svg } = await mermaid.render(`${id}-svg`, code);
          // 生成されたSVGを要素の中に挿入
          element.innerHTML = svg;
          // 処理済みフラグを立てる
          element.setAttribute("data-processed", "true");
          // 描画が成功したら表示する（初期状態はhiddenにしていることが多い）
          element.classList.remove("hidden");
        } catch (e) {
          console.warn("Mermaid rendering failed:", e);
          // 構文エラーなどで失敗した場合は、要素を非表示のままにするか、エラー表示を行う
          element.style.display = "none";
        }
      });
    },
    { deep: true, immediate: true }, // 配列の中身が変わった時や、初期表示時にも実行する設定
  );

  return {
    chatLogs,
    isAiThinking,
    deleteChatLog,
  };
}
