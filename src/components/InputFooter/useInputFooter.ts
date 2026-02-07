import { ref, onMounted, type Ref } from "vue";
import { useMyBrain } from "@/composables/useMyBrain";
// ★追加: TypeScriptの型エラーを防ぐために型定義をインポート
import type { Memory } from "@/types";

// 入力モードの型定義（この4つの文字列しか許可しない）
type InputMode = "memo" | "chat" | "url" | "calendar";

/**
 * フッター入力エリアのロジックを管理するカスタムフック
 * @param inputMode - 現在選択されている入力モード（親コンポーネントと同期）
 */
export function useInputFooter(inputMode: Ref<InputMode>) {
  // アプリの主要機能（脳みそ）から必要なアクションを取り出す
  const { addMemory, addUrlMemory, askBrain, isAiThinking, isSpeaking } =
    useMyBrain();

  // --- リアクティブな状態変数 (State) ---

  /** 入力中のテキスト */
  const inputText = ref("");

  /** 選択された画像ファイルのリスト */
  const selectedFiles = ref<File[]>([]);

  /** 画像のプレビュー表示用URLリスト */
  const filePreviews = ref<string[]>([]);

  /** ファイル選択input要素への参照（DOM操作用） */
  const fileInputRef = ref<HTMLInputElement | null>(null);

  /** 音声認識中かどうか */
  const isListening = ref(false);

  /** 音声入力モードが有効かどうか（送信後の挙動制御用） */
  const isVoiceMode = ref(false);

  // ブラウザ標準の音声認識オブジェクトを格納する変数
  let recognition: any = null;

  /**
   * コンポーネントがマウントされた時に実行される初期化処理
   * ブラウザが音声認識に対応しているか確認し、設定を行います。
   */
  onMounted(() => {
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      // ブラウザごとのプレフィックス差異を吸収
      const SpeechRecognition =
        (window as any).webkitSpeechRecognition ||
        (window as any).SpeechRecognition;

      recognition = new SpeechRecognition();
      recognition.lang = "ja-JP"; // 日本語に設定
      recognition.continuous = false; // 一文話し終わったら自動で止まる
      recognition.interimResults = true; // 話している途中の文字も取得する

      // 音声を認識した時のイベントハンドラ
      recognition.onresult = (event: any) => {
        // 認識結果を結合してテキストにする
        const transcript = Array.from(event.results)
          .map((r: any) => r[0].transcript)
          .join("");
        inputText.value = transcript; // 画面上の入力欄に反映
      };

      // 音声認識が終了した時のイベントハンドラ
      recognition.onend = () => {
        isListening.value = false;
        // 音声モードで、かつ何か話していれば自動送信する
        if (isVoiceMode.value && inputText.value.trim()) {
          handleSend(inputMode.value);
        }
      };
    }
  });

  /**
   * 音声入力の開始・停止を切り替える関数
   * マイクボタンが押された時に呼ばれます。
   */
  const toggleListening = () => {
    if (!recognition) return alert("音声入力未対応ブラウザです");

    if (isListening.value) {
      // 既に聞いているなら止める
      recognition.stop();
      isVoiceMode.value = false;
    } else {
      // 聞いていないなら開始する
      isListening.value = true;
      isVoiceMode.value = true; // 「音声モード」としてマーク
      recognition.start();
    }
  };

  /**
   * ファイル選択ダイアログで画像が選ばれた時の処理
   * @param e - input要素のchangeイベント
   */
  const handleFileSelect = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      // 既存のリストに追加する形でファイルを保存
      const files = Array.from(target.files);
      selectedFiles.value = [...selectedFiles.value, ...files];

      // プレビュー画像を生成する (FileReaderを使用)
      files.forEach((file) => {
        if (file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target?.result) {
              filePreviews.value.push(e.target.result as string);
            }
          };
          reader.readAsDataURL(file); // 画像データを読み込む
        }
      });
    }
  };

  /**
   * 選択中のファイルとプレビューを全てクリアする関数
   * 送信完了後などに呼ばれます。
   */
  const clearFiles = () => {
    selectedFiles.value = [];
    filePreviews.value = [];
    // inputタグの中身もリセットしないと、同じファイルを再度選べなくなるため
    if (fileInputRef.value) fileInputRef.value.value = "";
  };

  /**
   * テキストエリアに入力があった時の処理
   * 手動でキーボード入力されたら、音声自動送信モードを解除します。
   */
  const handleInput = () => {
    if (!isListening.value) {
      isVoiceMode.value = false;
    }
  };

  /**
   * 送信ボタンが押された時のメイン処理
   * 現在のモードに応じて適切なAPIを呼び出します。
   * * @param mode - 現在の入力モード
   */
  const handleSend = async (mode: InputMode) => {
    const text = inputText.value.trim();
    // テキストも画像もなければ何もしない（誤送信防止）
    if (!text && selectedFiles.value.length === 0) return;

    // 手動操作が入ったら音声モード解除
    if (!isListening.value && !isVoiceMode.value) {
      isVoiceMode.value = false;
    }

    const currentText = text;
    inputText.value = ""; // 送信したので入力欄を空にする

    // --- モードごとの分岐処理 ---
    if (mode === "memo") {
      // 【メモモード】: 記憶として保存
      const files = [...selectedFiles.value];
      clearFiles(); // ファイル選択状態をリセット

      // ★修正: 型注釈を追加 (Memory[] | null)
      // これにより、TypeScriptに「relatedにはMemory型の配列が入るよ」と伝えます。
      // ロジック自体は変更していません。
      const related: Memory[] | null = await addMemory(currentText, files);

      // 関連する過去の記憶が見つかったらアラートで教える
      if (related && related.length > 0) {
        const summaries = related.map((m) => `・${m.aiSummary}`).join("\n");
        alert(`保存しました！\n\n💡 関連する過去の記憶:\n${summaries}`);
      }
    } else if (mode === "url") {
      // 【URLモード】: Webページをスクレイピングして要約保存
      await addUrlMemory(currentText);
    } else {
      // 【チャット/カレンダーモード】: AIと対話してタスクや予定を操作
      clearFiles();
      await askBrain(currentText, isVoiceMode.value);
    }

    // 送信が終わったら音声モードは確実にオフにする
    if (!isListening.value) {
      isVoiceMode.value = false;
    }
  };

  // テンプレート（画面）側で使う変数や関数を公開
  return {
    inputText,
    selectedFiles,
    filePreviews,
    fileInputRef,
    isListening,
    isAiThinking,
    isSpeaking,
    toggleListening,
    handleFileSelect,
    clearFiles,
    handleSend,
    handleInput,
  };
}
