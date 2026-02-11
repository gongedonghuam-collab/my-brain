<script setup lang="ts">
import { ref } from "vue";
import { useMyBrain } from "@/composables/useMyBrain";

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits(["close"]);

const { currentUser, redeemInvite, loading } = useMyBrain();
const inputCode = ref("");

const copyCode = () => {
  if (currentUser.value?.inviteCode) {
    navigator.clipboard.writeText(currentUser.value.inviteCode);
    alert("コードをコピーしました！");
  }
};

const submitCode = async () => {
  if (!inputCode.value.trim()) return;
  await redeemInvite(inputCode.value.trim());
  inputCode.value = "";
  emit("close");
};

// シェア機能
const shareApp = async () => {
  if (navigator.share && currentUser.value?.inviteCode) {
    try {
      await navigator.share({
        title: "My Brain - AI秘書",
        text: `ズボラ専用AI秘書「My Brain」\n招待コード【${currentUser.value.inviteCode}】を入力すると無料枠が増えます！`,
        url: window.location.origin,
      });
    } catch (err) {
      console.error(err);
    }
  } else {
    copyCode();
  }
};
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
    @click.self="$emit('close')"
  >
    <div
      class="bg-[#18181b] w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-[#27272a] relative"
    >
      <button
        @click="$emit('close')"
        class="absolute top-4 right-4 text-slate-500 hover:text-white"
      >
        ✕
      </button>

      <div class="text-center mb-6">
        <div class="text-4xl mb-2">🎁</div>
        <h3 class="text-lg font-bold text-white">友達を招待する</h3>
        <p class="text-xs text-slate-400 mt-2">
          招待すると、お互いに<br /><span class="text-amber-400 font-bold"
            >無料枠が増量</span
          >されます！
        </p>
      </div>

      <div class="bg-[#09090b] rounded-xl p-4 mb-6 border border-[#27272a]">
        <div class="text-[10px] text-slate-500 mb-1 text-center">
          あなたの招待コード
        </div>
        <div
          class="text-2xl font-mono font-bold text-center text-white tracking-widest"
          @click="copyCode"
        >
          {{ currentUser?.inviteCode || "Loading..." }}
        </div>
        <button
          @click="shareApp"
          class="w-full mt-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2 rounded-lg transition flex items-center justify-center gap-2"
        >
          <span>📤</span> シェアする
        </button>
      </div>

      <div class="border-t border-[#27272a] pt-6">
        <p class="text-xs text-slate-400 mb-2 font-bold">
          招待コードを入力する
        </p>
        <div class="flex gap-2">
          <input
            v-model="inputCode"
            type="text"
            placeholder="コードを入力"
            class="flex-1 bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
          />
          <button
            @click="submitCode"
            :disabled="loading || !inputCode"
            class="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-xs font-bold px-4 rounded-lg transition"
          >
            適用
          </button>
        </div>
        <p
          v-if="currentUser?.invitedBy"
          class="text-[10px] text-green-500 mt-2"
        >
          ✅ 招待コード適用済み ({{ currentUser.invitedBy }})
        </p>
      </div>
    </div>
  </div>
</template>
