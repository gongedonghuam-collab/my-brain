<template>
  <div
    class="min-h-screen bg-slate-950 text-slate-300 p-6 md:p-12 font-sans overflow-y-auto"
  >
    <div class="max-w-3xl mx-auto pb-20">
      <h1 class="text-2xl font-bold text-white mb-8">プライバシーポリシー</h1>

      <div class="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 class="font-bold text-slate-100 mb-2">1. 収集する情報</h2>
          <p>当アプリ「My Brain」は、以下の情報を収集します。</p>
          <ul class="list-disc list-inside ml-4 mt-2 space-y-1">
            <li>
              Googleアカウント情報（メールアドレス、氏名、プロフィール画像）
            </li>
            <li>ユーザーが入力したメモ、画像、チャット履歴</li>
            <li>Googleカレンダーの予定情報（ユーザーが許可した場合のみ）</li>
          </ul>
        </section>

        <section>
          <h2 class="font-bold text-slate-100 mb-2">2. 情報の利用目的</h2>
          <p>収集した情報は、以下の目的で利用します。</p>
          <ul class="list-disc list-inside ml-4 mt-2 space-y-1">
            <li>
              アプリの機能提供（メモの保存、AIによる整理、カレンダー連携など）
            </li>
            <li>ユーザー認証およびアカウント管理</li>
            <li>サービスの改善および不具合の修正</li>
          </ul>
        </section>

        <section>
          <h2 class="font-bold text-slate-100 mb-2">3. 第三者への提供</h2>
          <p>
            当アプリは、法令に基づく場合を除き、ユーザーの同意なく個人情報を第三者に提供することはありません。
          </p>
          <p class="mt-2">
            ただし、AI機能の提供にあたり、入力データはGoogle Gemini
            API等のAIサービスプロバイダーに送信される場合があります。これらのデータはサービスの品質向上のために利用される可能性がありますが、個人を特定する形での外部公開は行われません。
          </p>
        </section>

        <section>
          <h2 class="font-bold text-slate-100 mb-2">
            4. データの保存とセキュリティ
          </h2>
          <p>
            ユーザーデータはFirebase（Google
            Cloud）上に安全に保存されます。通信はすべてSSL/TLSにより暗号化されています。
          </p>
        </section>

        <section>
          <h2 class="font-bold text-slate-100 mb-2">5. お問い合わせ</h2>
          <p>
            本ポリシーに関するお問い合わせは、以下のメールアドレスまでお願いいたします。
          </p>
          <p class="mt-1">gongedonghuam@gmail.com</p>
        </section>

        <div class="mt-10 border-t border-slate-800 pt-6">
          <router-link to="/" class="text-blue-400 hover:underline"
            >トップページに戻る</router-link
          >
        </div>
      </div>
    </div>
  </div>
</template>
