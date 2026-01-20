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
          <p>吉岡 拓海 (BlueCode)</p>
        </section>

        <section>
          <h2 class="font-bold text-slate-100 mb-2">運営統括責任者</h2>
          <p>吉岡 拓海</p>
        </section>

        <section>
          <h2 class="font-bold text-slate-100 mb-2">所在地</h2>
          <p>〒815-0041 福岡県福岡市南区野間1丁目19-1</p>
        </section>

        <section>
          <h2 class="font-bold text-slate-100 mb-2">電話番号</h2>
          <p>080-6423-6435</p>
          <p class="text-xs text-slate-500 mt-1">
            受付時間 10:00-18:00（土日祝を除く）
          </p>
        </section>

        <section>
          <h2 class="font-bold text-slate-100 mb-2">メールアドレス</h2>
          <p>gongedonghuam@gmail.com</p>
        </section>

        <section>
          <h2 class="font-bold text-slate-100 mb-2">販売価格</h2>
          <p>PROプラン: 月額980円（税込）</p>
        </section>

        <section>
          <h2 class="font-bold text-slate-100 mb-2">商品代金以外の必要料金</h2>
          <p>
            当サイトの閲覧、コンテンツのダウンロード、お問い合わせ等の際の電子メールの送受信時などに、所定の通信料が発生いたします。
          </p>
        </section>

        <section>
          <h2 class="font-bold text-slate-100 mb-2">お支払方法</h2>
          <p>クレジットカード決済（Stripe）</p>
        </section>

        <section>
          <h2 class="font-bold text-slate-100 mb-2">お支払時期</h2>
          <p>
            初回お申込み時に即時決済され、以降毎月同日に自動的に決済が行われます。<br />
            実際の引き落とし時期は、ご利用のクレジットカード会社の締め日や契約内容により異なります。
          </p>
        </section>

        <section>
          <h2 class="font-bold text-slate-100 mb-2">商品の引渡時期</h2>
          <p>決済手続き完了後、直ちにご利用いただけます。</p>
        </section>

        <section>
          <h2 class="font-bold text-slate-100 mb-2">
            返品・キャンセルについて
          </h2>
          <p>
            デジタルコンテンツの性質上、決済完了後の返品・返金には応じられません。<br />
            解約はいつでも可能です。次回更新日の前日までにお手続きください。なお、日割り計算による返金は行われません。
          </p>
        </section>

        <section>
          <h2 class="font-bold text-slate-100 mb-2">動作環境</h2>
          <p>
            推奨ブラウザ：Google Chrome 最新版、Safari 最新版、Microsoft Edge
            最新版<br />
            ※インターネット接続環境が必要です。
          </p>
        </section>
      </div>
    </div>
  </div>
</template>
