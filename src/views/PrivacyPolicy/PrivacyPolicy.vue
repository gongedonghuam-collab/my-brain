<template>
  <div
    class="min-h-screen bg-slate-950 text-slate-300 p-6 md:p-12 font-sans overflow-y-auto"
  >
    <div class="max-w-3xl mx-auto pb-20">
      <h1 class="text-2xl font-bold text-white mb-8">プライバシーポリシー</h1>

      <div class="space-y-8 text-sm leading-relaxed">
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
          <h2 class="font-bold text-slate-100 mb-2">
            3. Googleユーザーデータの取り扱い（重要）
          </h2>
          <p>
            当アプリは、Google Calendar
            APIを通じてユーザーのカレンダー情報にアクセスします。
            このデータは以下の目的でのみ使用され、その他の目的で利用したり、第三者に販売したりすることはありません。
          </p>
          <ul class="list-disc list-inside ml-4 mt-2 space-y-2 text-slate-400">
            <li>
              <strong>情報の取得:</strong>
              ユーザーの指示に基づき、空き状況の確認や予定の参照を行うため。
            </li>
            <li>
              <strong>情報の作成・編集:</strong>
              ユーザーの指示（チャットでの依頼）に基づき、カレンダーに新しい予定を作成、または既存の予定を編集・削除するため。
            </li>
            <li>
              <strong>データの保存:</strong>
              取得したカレンダー情報は、ユーザーへの通知やリマインダー機能を提供するために一時的にキャッシュされる場合がありますが、AIの学習データとして外部に共有されることはありません。
            </li>
          </ul>
          <div class="mt-4 p-3 bg-slate-900 rounded-lg border border-slate-800">
            <p class="text-xs text-slate-500">
              My Brain's use and transfer to any other app of information
              received from Google APIs will adhere to
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                class="text-blue-400 underline"
                >Google API Services User Data Policy</a
              >, including the Limited Use requirements.
            </p>
          </div>
        </section>

        <section>
          <h2 class="font-bold text-slate-100 mb-2">4. 第三者への提供</h2>
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
            5. データの保存とセキュリティ
          </h2>
          <p>
            ユーザーデータはFirebase（Google
            Cloud）上に安全に保存されます。通信はすべてSSL/TLSにより暗号化されています。
          </p>
        </section>

        <section>
          <h2 class="font-bold text-slate-100 mb-2">6. お問い合わせ</h2>
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
