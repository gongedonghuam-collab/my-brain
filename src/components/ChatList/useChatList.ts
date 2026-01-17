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
      try {
        // エラーを抑制しつつ実行
        mermaid.parseError = (err) => {
          console.warn("Mermaid syntax error (suppressed):", err);
        };
        await mermaid.run();
      } catch (e) {
        // ここで爆弾が出るのを防ぐため、何もしないかログだけ出す
        console.log("Mermaid rendering skipped.");
      }
    },
    { deep: true },
  );

  return {
    chatLogs,
    isAiThinking,
    deleteChatLog,
  };
}
