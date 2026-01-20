import { ref, onMounted, type Ref } from "vue";
import { useMyBrain } from "@/composables/useMyBrain";

type InputMode = "memo" | "chat" | "url" | "calendar";

// ★修正: inputModeをRefで受け取る（これでタブ切り替えを追跡できる）
export function useInputFooter(inputMode: Ref<InputMode>) {
  const { addMemory, addUrlMemory, askBrain, isAiThinking, isSpeaking } =
    useMyBrain();

  const inputText = ref("");
  const selectedFile = ref<File | null>(null);
  const filePreview = ref<string | null>(null);
  const fileInputRef = ref<HTMLInputElement | null>(null);
  const isListening = ref(false);
  const isVoiceMode = ref(false);

  let recognition: any = null;

  onMounted(() => {
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      const SpeechRecognition =
        (window as any).webkitSpeechRecognition ||
        (window as any).SpeechRecognition;
      recognition = new SpeechRecognition();
      recognition.lang = "ja-JP";
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((r: any) => r[0].transcript)
          .join("");
        inputText.value = transcript;
      };

      recognition.onend = () => {
        isListening.value = false;
        // ★修正: inputMode.value (現在のタブ) を参照して送信する
        if (isVoiceMode.value && inputText.value.trim()) {
          handleSend(inputMode.value);
        }
      };
    }
  });

  const toggleListening = () => {
    if (!recognition) return alert("音声入力未対応ブラウザです");
    if (isListening.value) {
      recognition.stop();
      isVoiceMode.value = false;
    } else {
      isListening.value = true;
      isVoiceMode.value = true; // 音声モードON
      recognition.start();
    }
  };

  const handleFileSelect = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      const file = target.files[0];
      selectedFile.value = file;
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          filePreview.value = e.target?.result as string;
        };
        reader.readAsDataURL(file);
      } else {
        filePreview.value = null;
      }
    }
  };

  const clearFile = () => {
    selectedFile.value = null;
    filePreview.value = null;
    if (fileInputRef.value) fileInputRef.value.value = "";
  };

  // テキスト入力を開始したら音声モードを解除
  const handleInput = () => {
    if (!isListening.value) {
      isVoiceMode.value = false;
    }
  };

  const handleSend = async (mode: InputMode) => {
    const text = inputText.value.trim();
    if (!text && !selectedFile.value) return;

    // 手動クリック送信の場合は音声モードではないとみなす（マイク経由の自動送信以外）
    if (!isListening.value && !isVoiceMode.value) {
      isVoiceMode.value = false;
    }

    const currentText = text;
    inputText.value = "";

    if (mode === "memo") {
      const file = selectedFile.value;
      clearFile();
      const related = await addMemory(currentText, file);
      if (related && related.length > 0) {
        const summaries = related.map((m) => `・${m.aiSummary}`).join("\n");
        alert(`保存しました！\n\n💡 関連する過去の記憶:\n${summaries}`);
      }
    } else if (mode === "url") {
      await addUrlMemory(currentText);
    } else {
      // チャットモード (会話タブ or カレンダータブ)
      clearFile();
      // 音声モードかどうかを渡して、読み上げの有無を制御
      await askBrain(currentText, isVoiceMode.value);
    }

    // 会話終了後は音声モードをリセットする（必要に応じて調整）
    if (!isListening.value) {
      isVoiceMode.value = false;
    }
  };

  return {
    inputText,
    selectedFile,
    filePreview,
    fileInputRef,
    isListening,
    isAiThinking,
    isSpeaking,
    toggleListening,
    handleFileSelect,
    clearFile,
    handleSend,
    handleInput, // ★追加: テキストエリアの入力監視用
  };
}
