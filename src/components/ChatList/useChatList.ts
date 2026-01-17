import { watch, nextTick } from "vue";
import { useMyBrain } from "@/composables/useMyBrain";
import mermaid from "mermaid";

export function useChatList() {
  const { chatLogs, isAiThinking, deleteChatLog } = useMyBrain();

  // チャットログが更新されたらマインドマップを再描画
  watch(
    chatLogs,
    async () => {
      await nextTick();

      // Mermaidクラスを持つ要素を全取得
      const elements = document.querySelectorAll(".mermaid");

      elements.forEach(async (el) => {
        const element = el as HTMLElement;
        // 既に処理済みならスキップ
        if (element.getAttribute("data-processed")) return;

        // data-code属性からコードを取得（ChatList.vueでセットしています）
        const code = element.getAttribute("data-code") || "";
        const id = element.id;

        if (!code || !id) return;

        try {
          // ★修正: render関数を使ってSVG文字列を生成してから挿入する（一番確実な方法）
          const { svg } = await mermaid.render(`${id}-svg`, code);
          element.innerHTML = svg;
          element.setAttribute("data-processed", "true");
          element.classList.remove("hidden"); // 描画成功したら表示
        } catch (e) {
          console.warn("Mermaid rendering failed:", e);
          // 失敗したら非表示のまま、もしくはエラー表示
          element.style.display = "none";
        }
      });
    },
    { deep: true, immediate: true },
  );

  return {
    chatLogs,
    isAiThinking,
    deleteChatLog,
  };
}
