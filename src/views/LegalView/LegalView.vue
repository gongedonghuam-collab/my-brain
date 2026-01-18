<script setup lang="ts">
import { useRouter } from "vue-router";
const router = useRouter();
</script>

<template>
  <div
    class="min-h-screen bg-slate-950 text-slate-300 p-6 md:p-12 font-sans overflow-y-auto"
  >
    <div class="max-w-3xl mx-auto pb-20">
      <button
        @click="router.back()"
        class="mb-6 text-sm text-slate-500 hover:text-white transition"
      >
        ← 戻る
      </button>

      <h1 class="text-2xl font-bold text-white mb-8">
        特定商取引法に基づく表記
      </h1>

      <div class="space-y-8 text-sm leading-relaxed">
        <section>
          <h2 class="font-bold text-slate-100 mb-2">販売業者</h2>
          <p>（あなたの氏名または屋号）</p>
        </section>

        <section>
          <h2 class="font-bold text-slate-100 mb-2">所在地</h2>
          <p>（あなたの住所またはバーチャルオフィスの住所）</p>
        </section>

        <section>
          <h2 class="font-bold text-slate-100 mb-2">電話番号</h2>
          <p>（電話番号）</p>
        </section>

        <section>
          <h2 class="font-bold text-slate-100 mb-2">メールアドレス</h2>
          <p>support@mybrain-app.com</p>
        </section>

        <section>
          <h2 class="font-bold text-slate-100 mb-2">販売価格</h2>
          <p>PROプラン: 月額1,000円（税込）</p>
        </section>

        <section>
          <h2 class="font-bold text-slate-100 mb-2">支払方法と時期</h2>
          <p>
            クレジットカード決済（Stripe）。初回申込時に決済され、以降毎月同日に自動更新されます。
          </p>
        </section>

        <section>
          <h2 class="font-bold text-slate-100 mb-2">キャンセル・解約</h2>
          <p>
            アプリ内の設定、またはStripeのカスタマーポータルよりいつでも解約可能です。次回更新日の前日までに手続きを行ってください。
          </p>
        </section>
      </div>
    </div>
  </div>
</template>
