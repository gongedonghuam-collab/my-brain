<script setup lang="ts">
import { watch, onMounted, nextTick } from "vue";
import { useChatList } from "./useChatList";

const { chatLogs, isAiThinking, deleteChatLog } = useChatList();

// 処理済みログIDを管理（二重実行防止）
const animatedLogIds = new Set<string>();

// タイピングアニメーション関数
const animateText = (log: any) => {
  // すでに表示済みなら何もしない
  if (!log.displayAnswer) log.displayAnswer = "";
  if (log.displayAnswer === log.answer) return;

  const fullText = log.answer || "";
  let currentIndex = 0;
  const speed = 20; // 文字送りの速度

  // アニメーションループ
  const typeChar = () => {
    if (currentIndex < fullText.length) {
      log.displayAnswer += fullText.charAt(currentIndex);
      currentIndex++;

      // 自動スクロール
      window.scrollTo(0, document.body.scrollHeight);
      requestAnimationFrame(() => setTimeout(typeChar, speed));
    } else {
      log.isAnimating = false;
      log.displayAnswer = fullText; // 最終的に全文をセット
    }
  };

  typeChar();
};

// 監視: チャットログの「配列の長さ」が変わった時だけ実行
watch(
  () => chatLogs.value.length,
  () => {
    // 最新のログを取得
    const lastLog = chatLogs.value[chatLogs.value.length - 1];

    // アニメーション対象で、まだ実行していない場合
    if (lastLog && lastLog.isAnimating && !animatedLogIds.has(lastLog.id)) {
      animatedLogIds.add(lastLog.id);
      lastLog.displayAnswer = ""; // 初期化
      animateText(lastLog);
    }
  },
);

// マウント時: 過去ログは即時表示（アニメーションなし）
onMounted(() => {
  chatLogs.value.forEach((log) => {
    // 過去ログはアニメーションさせない
    log.displayAnswer = log.answer;
    log.isAnimating = false;
    animatedLogIds.add(log.id); // 処理済みとしてマーク
  });

  // 最下部へスクロール
  window.scrollTo(0, document.body.scrollHeight);
});
</script>

<template>
  <div class="space-y-8 px-2 pb-4">
    <div
      v-if="chatLogs.length === 0 && !isAiThinking"
      class="text-center py-20 opacity-30"
    >
      <div class="text-4xl mb-4">💬</div>
      <p>履歴がありません。</p>
    </div>

    <div
      v-for="log in chatLogs"
      :key="log.id"
      class="animate-fade-in space-y-2"
    >
      <div class="flex justify-end">
        <div
          class="bg-slate-700 text-white px-4 py-3 rounded-2xl rounded-tr-sm text-sm max-w-[85%] shadow-sm"
        >
          {{ log.question }}
        </div>
      </div>

      <div class="flex flex-col items-start max-w-[95%]">
        <div
          class="bg-indigo-900/40 border border-indigo-500/20 text-indigo-100 px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed whitespace-pre-wrap w-full shadow-sm"
        >
          {{ log.displayAnswer || log.answer }}

          <span
            v-if="log.isAnimating"
            class="inline-block w-2 h-4 bg-indigo-400 ml-1 animate-pulse align-middle"
          ></span>
        </div>

        <div v-if="log.mermaidCode" class="mermaid-container w-full mt-2">
          <div
            :id="'mermaid-' + log.id"
            class="mermaid bg-slate-900 p-4 rounded-xl overflow-x-auto text-center border border-slate-700 hidden"
            :data-code="log.mermaidCode"
          ></div>
        </div>

        <a
          v-if="log.action"
          :href="log.action.url"
          target="_blank"
          class="mt-2 flex items-center gap-3 bg-slate-800 hover:bg-slate-700 p-3 rounded-xl transition border border-slate-700 text-slate-300 w-full active:scale-95"
        >
          <span class="text-2xl">📅</span>
          <div class="flex-1 min-w-0">
            <div class="font-bold text-[10px] text-blue-400">
              カレンダーに追加
            </div>
            <div class="font-bold text-sm truncate">
              {{ log.action.title }}
            </div>
          </div>
          <span class="text-xl">→</span>
        </a>

        <div class="flex items-center gap-2 mt-1 ml-1">
          <button
            @click="deleteChatLog(log.id)"
            class="text-[10px] text-slate-500 bg-slate-800/50 px-3 py-1.5 rounded-full flex items-center gap-1 hover:bg-red-900/30 hover:text-red-400 transition active:scale-90"
          >
            🗑️ 履歴を削除
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="isAiThinking"
      class="flex flex-col items-start max-w-[95%] animate-pulse-soft"
    >
      <div class="flex items-center gap-2 mb-1 ml-1">
        <span class="text-lg">🧠</span>
        <span class="text-[10px] font-bold text-blue-400">My Brain</span>
      </div>
      <div
        class="bg-slate-800/50 border border-slate-700/50 text-slate-300 px-4 py-3 rounded-2xl rounded-tl-sm text-sm w-full shadow-sm flex items-center gap-2"
      >
        <div class="flex gap-1">
          <div
            class="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"
            style="animation-delay: 0s"
          ></div>
          <div
            class="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"
            style="animation-delay: 0.2s"
          ></div>
          <div
            class="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"
            style="animation-delay: 0.4s"
          ></div>
        </div>
        <span class="text-xs font-bold tracking-wide">思考中...</span>
      </div>
    </div>
  </div>
</template>
